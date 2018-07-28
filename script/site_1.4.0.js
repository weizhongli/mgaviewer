var frv = {};
var frvtop = {};
var frvbottom = {};

var plotFinished = 0;

if(typeof(String.prototype.trim) === "undefined") {
    String.prototype.trim = function() {
        return String(this).replace(/^\s+|\s+$/g, '');
    };
}

$.easing.delayed = function (x,t, b, c, d) {
    if (t < d/2)
        return b;
    else
        return b+c;
}

/**
jQuery.fn.sortElements
by JAMES PADOLSEY
http://james.padolsey.com/javascript/sorting-elements-with-jquery/
*/
jQuery.fn.sortElements = (function(){
 
    var sort = [].sort;
 
    return function(comparator, getSortable) {
 
        getSortable = getSortable || function(){return this;};
 
        var placements = this.map(function(){
 
            var sortElement = getSortable.call(this),
                parentNode = sortElement.parentNode,
 
                // Since the element itself will change position, we have
                // to have some way of storing its original position in
                // the DOM. The easiest way is to have a 'flag' node:
                nextSibling = parentNode.insertBefore(
                    document.createTextNode(''),
                    sortElement.nextSibling
                );
 
            return function() {
 
                if (parentNode === this) {
                    throw new Error(
                        "You can't sort elements if any one is a descendant of another."
                    );
                }
 
                // Insert before flag:
                parentNode.insertBefore(this, nextSibling);
                // Remove flag:
                parentNode.removeChild(nextSibling);
 
            };
 
        });
 
        return sort.call(this, comparator).each(function(i){
            placements[i].call(getSortable.call(this));
        });
 
    };
 
})();

$(document).ready(function() {
    //Counts
    $('#seleref h4').text('References ('+$('#seleref :radio').length+')');
    $('#selesample h4').text('Samples ('+$('#selesample :checkbox').length+')');

    //Main Plot
    frv.placeholder = $("#placeholdermain");
    frv.loader = $('#loader');
    frv.options= {
        series: {lines: {show:false}, points: {show:false}, Nfrags:{show:true, lineWidth:1}},
        xaxis: {show:false,zoomRange:[1000,3415000], panRange:[0,null], min:0,
                tickFormatter:commaFormatter},
        yaxis: {zoomRange: false, panRange:[null,100], max:100, min:70, autoscaleMargin: null, 
                tickFormatter:percentageFormatter, labelWidth:40, tickSize:5},
        legend: {backgroundOpacity: 0.8, showCount: false},
        grid: {backgroundColor:"#fff", hoverable:true, clickable:true},
        zoom: {
            interactive: true,
            amount: 2 },
        pan: {
            interactive: true
        },
        colors: colorseries,
        refannotation: false
    };
    frv.data = new Array;
    frv.datafiles = [];
    frv.placeholderwidth = frv.placeholder.width();
    frv.currentZoomLevel = null;

    //Top plot
    frvtop.placeholder = $("#placeholdertop");
    frvtop.options = {
        series: {lines: {show:true,steps:true,lineWidth:1}, points:{show:false}, shadowSize:0},
        xaxis: {show:false,zoomRange:[1000,3415000], panRange:[0,null], min:0,
                tickFormatter:commaFormatter},
        yaxis: {zoomRange: false, panRange: false, max:null, autoscaleMargin: null, 
                tickFormatter:nonzeroFormatter, labelWidth:40},
        grid: {backgroundColor: "#EEEFFF"},
        legend: {show: false},
        colors: colorseries,
        selection: { mode: "x" }
    };
    frvtop.data = new Array;
    frvtop.datafiles = [];

    //Bottom plot
    frvbottom.placeholder = $("#placeholderbottom");
    frvbottom.options = {
        series: {lines: {show:false}, points: {show:false}, frags:{show:true, lineWidth:1}},
        xaxis: {show:true,zoomRange:[1000,3415000], panRange:[0,null], min:0,
                tickFormatter:commaFormatter},
        yaxis: {zoomRange: false, panRange: false, min:96.5, max:100, autoscaleMargin: null, 
                tickFormatter:emptyFormatter, labelWidth:40},
        legend: {backgroundOpacity: 0.8},
        grid: {backgroundColor:"#fff", hoverable:true, clickable:false},
        zoom: {
            interactive: false,
            amount: 2 },
        pan: {
            interactive: false
        },
        colors: colorseries,
        refannotation: false
    }
    frvbottom.data = new Array;
    frvbottom.datafiles = [];


    //Bindings
    $('#togglelegend').click(function() {
        $('.legend').fadeToggle();
    });

    $('#btndeseleall').click(function() {
        $('#selesample .selected input').trigger('click');
    });

    $('#seleref .selelist input').click(function() {
        raiseSelectionRadio2($(this));
    });
    $('#selesample .selelist input').click(function() {
        raiseSelectionCheck($(this));
    });

    $.getJSON('data/stats.json', function(jsondata) {
        stats = jsondata;
        raiseSelectionRadio2($('#seleref .selelist input:checked'));
        raiseSelectionCheck($('#selesample .selelist input:checked'));
        update();
        $('.updatebutton').removeClass('attention');
    });

    frv.placeholder.bind("plotzoom", function() {
        var zl = zoomLevel(frv.plot.getAxes().xaxis.max-frv.plot.getAxes().xaxis.min,frv.placeholderwidth);
        updateByZoomLevel(zl);
    });

    frvtop.placeholder.bind("plotselected", function(event, ranges) {
        updateByRangeLevel(ranges);
    });

    $('.updatebutton').click(function() {
        update();
        $(this).removeClass('attention');
    });

    $('.btnsch').click(function() {
        searchList($(this));
    });
    $('.btnrst').click(function() {
        resetList($(this));
    });
    $('.refsort').click(function() {
      updateHits();
      sortByHits();
    });
    $('.schbox input').submit(function() {
        $(this).siblings('.btnsch').click();
    });

});

function update() {
    $('.button').attr('disabled','disabled');

    //Main plot
    var ref = $('#seleref .selected input').attr('value');
    frv.refgi = ref;
    var reflength = parseInt($('#seleref .selected input').attr('length'));
    //--set plot range
    frv.options.xaxis.zoomRange = [1000,reflength];
    frv.options.xaxis.panRange = [0,reflength];
    frv.options.xaxis.max = reflength;
    var samples = [];
    $('#selesample .selected input').each(function(index){
        var smp1 = $(this).val();
        if (stats[frv.refgi+"|"+smp1] > 0 ) {
          //samples.push($(this).val());
          samples.push(smp1);
        }
        else {
          alert('no alignment between '+smp1+' and '+frv.refgi+', sample removed');
          $(this).attr('checked','');
          raiseSelectionCheck($(this));
        }
    });
    if (samples.length == 0) {
        alert("At leaset ONE sample needs to be selected");
        return;
    }

    frv.datafiles = [];
    frv.currentZoomLevel = zoomLevel(reflength,frv.placeholderwidth);
    console.log('current Zoom level',frv.currentZoomLevel);

    for (var i = 0; i < samples.length; i++) {
        //frv.datafiles.push('data/GI'+ref+'/GI'+ref+'-'+samples[i]+'-L'+frv.currentZoomLevel+'.json');
        //frv.datafiles.push('data/'+samples[i]+'/GI'+ref+'-'+samples[i]+'-L'+frv.currentZoomLevel+'.json');
        frv.datafiles.push('data/'+samples[i]+'/GI'+ref+'-'+samples[i]+'.json');
        //alert('data/'+samples[i]+'/GI'+ref+'-'+samples[i]+'.json');
    }
    plotdata_main(frv.datafiles,frv.data,frv.placeholder,frv.options);
    $('#xaxislabel').html('Reference Genome: '+$('#seleref input:checked').parent().text()+' <a href="http://www.ncbi.nlm.nih.gov/nuccore/'+ref+'" target="_new" class="label">LINK</a>');

    //Top plot
    //--set plot range
    frvtop.options.xaxis.zoomRange = [1000,reflength];
    frvtop.options.xaxis.panRange = [0,reflength];
    frvtop.options.xaxis.max = reflength;
    frvtop.datafiles = [];
    for (var i = 0; i < samples.length; i++) {
        //frvtop.datafiles.push('data/GI'+ref+'/GI'+ref+'-'+samples[i]+'-Coverage.json');//Coverage
        frvtop.datafiles.push('data/'+samples[i]+'/GI'+ref+'-'+samples[i]+'-Coverage.json');//Coverage
        //alert('data/'+samples[i]+'/GI'+ref+'-'+samples[i]+'-Coverage.json');
    }
    plotdata_top(frvtop.datafiles,frvtop.data,frvtop.placeholder,frvtop.options);

    //Bottom plot
    //--set plot range
    frvbottom.options.xaxis.zoomRange = [1000,reflength];
    frvbottom.options.xaxis.panRange = [0,reflength];
    frvbottom.options.xaxis.max = parseInt(reflength);
    //
    frvbottom.datafiles = [];
    frvbottom.datafiles.push('data/Ref/GI'+ref+'-Ref.json');//Annotation
    //alert('data/Ref/GI'+ref+'-Ref.json');
    plotdata_bottom(frvbottom.datafiles,frvbottom.data,frvbottom.placeholder,frvbottom.options);
    //
}

function updateByZoomLevel(zoomlevel) { //Weizhong
    if (zoomlevel == frv.currentZoomLevel)
        return;
    else
        frv.currentZoomLevel = zoomlevel;

    var currentMin = frv.plot.getAxes().xaxis.min;
    var currentMax = frv.plot.getAxes().xaxis.max;
    plotFinished = 2;
    plotdata_main(frv.datafiles,frv.data,frv.placeholder,$.extend(true,{},frv.options,{xaxis:{min:currentMin,max:currentMax}}));
}

function updateByRangeLevel(ranges) { //Weizhong
    frv.currentZoomLevel = zoomLevel(frv.plot.getAxes().xaxis.max-frv.plot.getAxes().xaxis.min,frv.placeholderwidth); 
    plotdata_main(        frv.datafiles,      frv.data,      frv.placeholder,$.extend(true,{},      frv.options,{xaxis:{min:ranges.xaxis.from, max:ranges.xaxis.to }}));
    plotdata_top(      frvtop.datafiles,   frvtop.data,   frvtop.placeholder,$.extend(true,{},   frvtop.options,{xaxis:{min:ranges.xaxis.from, max:ranges.xaxis.to }}));
    plotdata_bottom(frvbottom.datafiles,frvbottom.data,frvbottom.placeholder,$.extend(true,{},frvbottom.options,{xaxis:{min:ranges.xaxis.from, max:ranges.xaxis.to }}));
}

function otherBindings() {
    //These bindings need to be activated only after plot objects are created

    //Sync plots
    $("#placeholdermain").bind("plotzoom plotpan plotselected", function(event, plotobj) {
        xaxis = plotobj.getAxes().xaxis;
        //frvtop
        xaxisoptionstop = frvtop.plot.getAxes().xaxis.options;
        xaxisoptionstop.min = xaxis.min;
        xaxisoptionstop.max = xaxis.max;
        frvtop.plot.setupGrid();
        frvtop.plot.draw();
        //frvbottom
        xaxisoptionsbottom = frvbottom.plot.getAxes().xaxis.options;
        xaxisoptionsbottom.min = xaxis.min;
        xaxisoptionsbottom.max = xaxis.max;
        frvbottom.plot.setupGrid();
        frvbottom.plot.draw();
    });

    //Tooltip for data points
    if (frv.currentZoomLevel <= 3)
        bindTooltips_main(frv.plot);
    else
        frv.placeholder.unbind("plothover");
    bindTooltips(frvbottom.plot);
}

function plotdata_bottom(datafiles, data, placeholder, options) {
    frv.loader.show();
    var numData = datafiles.length, finished = 0;
    data = [];
    for (var i = 0; i < numData; i++) {
        $.getJSON(datafiles[i], function(jsondata, textstatus) {
            // Reference
            //alert(textstatus + ' ' + datafiles[i]);
            if (jsondata.tag == "genomeannotation") {
                jsondata["genomeannotation"] = true;
                jsondata["annotationoffset"] = 99;
                jsondata["frags"] = {show:true,lineWidth:5,headSize:0};
                data.push(jsondata);
            }
            else {
                alert('work type of annotation file');
            }
            finished++;
            if (finished == numData) {
                plotitbottom(placeholder,data,options);
            }
            //All plots are done
            if (plotFinished == 3) {
                otherBindings();
                //Clean up
                frv.loader.fadeOut();
                plotFinished = 0;
                $('.button').removeAttr('disabled');
            }
        })
        .error(function() { 
            alert(' error loading '+ datafiles[i-1]); 
        });
    }
} //plotdata_bottom


function plotdata_top(datafiles, data, placeholder, options) {
    frv.loader.show();
    var numData = datafiles.length, finished = 0;
    data = [];
    for (var i = 0; i < numData; i++) {
        $.getJSON(datafiles[i], function(jsondata, textstatus) {
            data.push(jsondata);
            finished++;
            if (finished == numData) {
                data.sort(sortbylabel);
                plotittop(placeholder,data,options);
            }
            if (plotFinished == 3) {
                otherBindings();
                //Clean up
                frv.loader.fadeOut();
                plotFinished = 0;
                $('.button').removeAttr('disabled');
            }
        })
        .error(function() { 
            data.push({ label: datafiles[i-1], data: [] });  // here i-1 big problem not solved yet
            finished++;
            if (finished == numData) {
                data.sort(sortbylabel);
                plotittop(placeholder,data,options);
            }
            if (plotFinished == 3) {
                otherBindings();
                //Clean up
                frv.loader.fadeOut();
                plotFinished = 0;
                $('.button').removeAttr('disabled');
            }
            alert(' error loading '+ datafiles[i-1]); 
        });
    }
    //
    function sortbylabel(a,b) {
        var label_a = a["label"];
        var label_b = b["label"];
        if (label_a==undefined)
            label_a = '~'
        if (label_b==undefined)
            label_b = '~';
        if (label_a < label_b)
            return -1;
        else if (label_a > label_b)
            return 1;
        else
            return 0;
    }
} //plotdata_top


function plotdata_main(datafiles, data, placeholder, options) {
    frv.loader.show();
    var numData = datafiles.length, finished = 0;
    data = [];
    for (var i = 0; i < numData; i++) {
        $.getJSON(datafiles[i], function(jsondata, textstatus) {
            var seriesLength = stats[frv.refgi+"|"+jsondata.label];
            jsondata.label += " <b>("+seriesLength+")</b>";
            jsondata.hoverable = true;
            jsondata.clickable = false;
            data.push(jsondata);
            finished++;

            if (finished == numData) {
                data.sort(sortbylabel);
                plotitmain(placeholder,data,options);
            }
            if (plotFinished == 3) {
                otherBindings();
                //Clean up
                frv.loader.fadeOut();
                plotFinished = 0;
                $('.button').removeAttr('disabled');
            }
        })
        .error(function() { 
            data.push({ label: datafiles[i-1], data: [] });
            finished++;

            if (finished == numData) {
                data.sort(sortbylabel);
                plotitmain(placeholder,data,options);
            }
            if (plotFinished == 3) {
                otherBindings();
                //Clean up
                frv.loader.fadeOut();
                plotFinished = 0;
                $('.button').removeAttr('disabled');
            }
            alert(' error loading '+ datafiles[i-1]); 
        });
    }
    //
    function sortbylabel(a,b) {
        var label_a = a["label"];
        var label_b = b["label"];
        if (label_a==undefined)
            label_a = '~'
        if (label_b==undefined)
            label_b = '~';
        if (label_a < label_b)
            return -1;
        else if (label_a > label_b)
            return 1;
        else
            return 0;
    }
} //plotdata_main



function plotitmain(placeholder, data, options) {
    var plotobj = $.plot(placeholder, data, options);

    frv.plot = plotobj;
    frv.ymin = frv.plot.getAxes().yaxis.min;
    frv.plot.getAxes().yaxis.options.panRange = [frv.ymin,100];
    addControl(plotobj);

    plotFinished++;

    return plotobj;
}

function plotittop(placeholder, data, options) {
    var plotobj = $.plot(placeholder, data, options);

    frvtop.plot = plotobj;
    //addControltop(plotobj);

    plotFinished++;

    return plotobj;
}

function plotitbottom(placeholder, data, options) {
    var plotobj = $.plot(placeholder, data, options);

    frvbottom.plot = plotobj;

    plotFinished++;

    return plotobj;
}

function zoomLevel(range, plotwidth) {
    var z = Math.floor(Math.log(range/plotwidth)/Math.log(2));
    //if (z < 7)
    //    z = 0;
    return z;
}

function percentageFormatter(v, axis) {
    return v+"%";
}

function emptyFormatter(v, axis) {
    return '';
}

function commaFormatter(v, axis) {
    v = v+'';
    var parts = Array();
    while (v) {
        if (v.length > 3) {
            parts.push(v.substr(-3,3));
            v = v.slice(0,-3);
        }
        else {
            parts.push(v);
            v = '';
        }
    }
    parts.reverse();
    return parts.join();
}

function nonzeroFormatter(v, axis) {
    if (v == '0')
        return '';
    else
        return v;
}


function bindTooltips_bottom(plotobj) {
    //Annotation Tooltips
    var placeholder = plotobj.getPlaceholder();
    var previousPoint = null;
    placeholder.bind("plothover plotclick", function(event, pos, item) {
        if (item) {
            if (previousPoint != item.dataIndex) {
                previousPoint = item.dataIndex;
                $("#tooltip").remove();
                var x = item.datapoint[0].toFixed(2),
                    y = item.datapoint[1].toFixed(2);
                var tooltipcontent = "";
                var seriesIndex = item.seriesIndex,
                    dataIndex = item.dataIndex;
                var series = plotobj.getData()[seriesIndex];
                var datapoint = series['data'][dataIndex];
                if (series['tag']=='genomeannotation') {
                    tooltipcontent += datapoint[6]+'<br/>';
                    if (datapoint[4] == 'p')
                        tooltipcontent += '<b>GI</b>:'+datapoint[5];
                    else
                        tooltipcontent += '<b>GeneID</b>:'+datapoint[5];
                    showTooltip(item.pageX, item.pageY, tooltipcontent);
                    if (event.type == 'plotclick') {
                        window.open('http://www.ncbi.nlm.nih.gov/protein/'+datapoint[4]);
                    }
                }
                else {
                    tooltipcontent += '<b>Sample Acc</b>: '+series['label']+'<br/>';
                    tooltipcontent += '<b>Length</b>: '+(datapoint[1]-datapoint[0]+1);
                    tooltipcontent += '<br><b>zoom level</b>: '+ frv.currentZoomLevel;
                    showTooltip(item.pageX, item.pageY, tooltipcontent);
                }
            }
        }
        else {
            $("#tooltip").remove();
            previousPoint = null;
        }
    });
}


function bindTooltips_main(plotobj) {
    //Annotation Tooltips
    var placeholder = plotobj.getPlaceholder();
    var previousPoint = null;
    placeholder.bind("plothover plotclick", function(event, pos, item) {
        if (item) {
            if (previousPoint != item.dataIndex) {
                previousPoint = item.dataIndex;
                $("#tooltip").remove();
                var x = item.datapoint[0].toFixed(2),
                    y = item.datapoint[1].toFixed(2);
                var tooltipcontent = "";
                var seriesIndex = item.seriesIndex,
                    dataIndex = item.dataIndex;
                var series = plotobj.getData()[seriesIndex];                       //Weizhong 
                var datapoint = series['data'][dataIndex];                         //Weizhong
                    tooltipcontent += 'Sample: '+series['label'];                  //Weizhong
                    //tooltipcontent += '<br>Length: '+datapoint[2];               //Weizhong
                    //tooltipcontent += '<br>Identity: '+datapoint[1] + ' %';      //Weizhong
                    //tooltipcontent += '<br>Pos: '+datapoint[0];                  //Weizhong
                    //tooltipcontent += '<br>Alignments: ' + datapoint[3];         //Weizhong
                    // Weizhong, after skip data check (prodessData), the item.datapoint[] is no longer same with series['data'][i]
                    // So:
                    tooltipcontent += '<br>Length: '+item.datapoint[2];            //Weizhong
                    tooltipcontent += '<br>Identity: '+item.datapoint[1] + ' %';   //Weizhong
                    tooltipcontent += '<br>Alignment Pos: '+item.datapoint[0];     //Weizhong
                    tooltipcontent += '<br>Alignments: '+item.datapoint[3];        //Weizhong
                    showTooltip(item.pageX, item.pageY, tooltipcontent);        
            }
        }
        else {
            $("#tooltip").remove();
            previousPoint = null;
        }
    });
}

function bindTooltips(plotobj) {
    //Annotation Tooltips
    var placeholder = plotobj.getPlaceholder();
    var previousPoint = null;
    placeholder.bind("plothover plotclick", function(event, pos, item) {
        if (item) {
            if (previousPoint != item.dataIndex) {
                previousPoint = item.dataIndex;
                $("#tooltip").remove();
                var x = item.datapoint[0].toFixed(2),
                    y = item.datapoint[1].toFixed(2);
                var tooltipcontent = "";
                var seriesIndex = item.seriesIndex,
                    dataIndex = item.dataIndex;
                var series = plotobj.getData()[seriesIndex];
                var datapoint = series['data'][dataIndex];
                if (series['tag']=='genomeannotation') {
                    tooltipcontent += datapoint[6]+'<br/>';
                    if (datapoint[4] == 'p')
                        tooltipcontent += '<b>GI</b>:'+datapoint[5];
                    else
                        tooltipcontent += '<b>GeneID</b>:'+datapoint[5];
                    showTooltip(item.pageX, item.pageY, tooltipcontent);
                    if (event.type == 'plotclick') {
                        window.open('http://www.ncbi.nlm.nih.gov/protein/'+datapoint[4]);
                    }
                }
                else {
                    tooltipcontent += '<b>Sample Acc</b>: '+series['label']+'<br/>';
                    tooltipcontent += '<b>Length</b>: '+(datapoint[1]-datapoint[0]+1);
                    tooltipcontent += '<br><b>zoom level</b>: '+ frv.currentZoomLevel;
                    showTooltip(item.pageX, item.pageY, tooltipcontent);
                }
            }
        }
        else {
            $("#tooltip").remove();
            previousPoint = null;
        }
    });
}

function highlightSelection() {
    $('#selections input').each(function(index) {
        if ($(this).attr('checked')) {
            $(this).addClass('highlighted');
        }
        else {
            $(this).parent().removeClass('highlighted');
        }
    });
}

function raiseSelectionRadio(item) {
    p = item.parent();
    $('#seleref').find('.selected div').remove();
    p.parent().find('div.selecteditem').removeClass('selecteditem');
    p.hide().addClass('selecteditem');
    p.clone().hide().appendTo(p.parent().parent().find('.selected')).fadeIn();
    showMatched($('#seleref .selelist'));
}

function raiseSelectionRadio2(item) {
    $('.updatebutton').addClass('attention');

    p = item.parent();
    $('#seleref').find('.selected div').remove();
    p.parent().find('div.selecteditem').removeClass('selecteditem highlighted');
    p.addClass('selecteditem highlighted');
    p.clone().hide().appendTo(p.parent().parent().find('.selected')).show();

    //Sort list by # hits
    //updateHits();
    //sortByHits();

    showMatched($('#seleref .selelist'));
}

function updateHits() {
    $('#seleref .selelist div').each(function(index) {
        var thisinput = $(this).find('input');
        var gi = thisinput.attr('value');
        var hits = 0;
        $('#selesample .selected input').each(function(index2) {
            var sampleid = $(this).attr('value');
            hits += stats[gi+'|'+sampleid];
        });
        thisinput.attr('hits', hits);
    });
}

function sortByHits() {
    $('#seleref .selelist div').sortElements(function(a,b) {
        var hits_a = parseInt($(a).find('input').attr('hits'));
        var hits_b = parseInt($(b).find('input').attr('hits'));
        return hits_a > hits_b ? -1 : 1;
    });
}

function raiseSelectionCheck(item) {
    $('.updatebutton').addClass('attention');

    p = item.parent();
    if (item.attr('checked')) {
        if ($('#selesample .selected input').length > 7) {
            item.attr('checked', false);
            alert("Up to 8 samples can be selected at the same time.");
            return;
        }
        p.slideUp('fast').addClass('selecteditem');
        p.clone().hide().appendTo(p.parent().parent().find('.selected')).slideDown('fast').find('input').click(function() {
            raiseSelectionCheck($(this));
        });
    }
    else {
        p.slideUp('fast');
        $('#selesample .selelist input[value="'+item.val()+'"]').attr('checked',false).parent().removeClass('selecteditem');
        showMatched($('#selesample .selelist'));
        p.remove();
    }

    //updateHits();
    //sortByHits();
}

function searchList(button) {
    var query = button.siblings('input').val();
    query = query.trim();
    if (query) {
        button.parent().parent().find('.selelist div').each(function() {
            $(this).addClass('matched');
        });
        var patt = new RegExp(query,'i');
        button.parent().parent().find('.selelist div').each(function() {
            if ($(this).text().search(patt) == -1) {
                $(this).removeClass('matched');
            }
        });
        showMatched(button.parent().parent().find('.selelist'));
    }
}

function resetList(button) {
    button.siblings('input').val('');
    button.parent().parent().children('.selelist').children('div').each(function() {
        $(this).addClass('matched');
    });
    button.parent().parent().find('.selelist').find('div.matched:not(.selecteditem)').show();
}

function showMatched(container) {
    container.find('div.matched:not(.selecteditem)').show();
    container.find('div:not(.matched)').hide();
}

function showTooltip(x, y, contents) {
    var width = 250;
    var side = 'left';
    if (($(window).width()-x) < (width+5))
        side = 'right';

    var css = {
        position: 'absolute',
        display: 'none',
        top: y + 10,
        'width': width+'px',
        'font-size': '0.8em',
        border: '1px solid #fdd',
        padding: '5px',
        'background-color': '#000',
        'color': '#fff',
        opacity: 0.8
    }
    css['left'] = (side=='left')?(x+5):(x-5-width);
    $('<div id="tooltip">' + contents + '</div>').css(css).appendTo("body").show(500,'delayed');
}

function addControltop(plot) {
    var plotoffset = plot.getPlotOffset(),
        los = plotoffset['left'],
        bos = plotoffset['bottom'],
        tos = plotoffset['top'],
        ros = plotoffset['right'];
    var placeholder = plot.getPlaceholder();
alert('los: '+los+' bos: '+bos);
    // add zooming buttons for Y axis
    $('<img id="ytopzoominbutton" class="button" src="img/zin.png" alt="Y-axis zoom in" title="Y-axis zoom in" style="right:'+(ros+5)+'px;bottom:'+(bos+555)+'px"/>').appendTo(placeholder);
return;
    $('<img id="ytopzoominbutton" class="button" src="img/zin.png" alt="Y-axis zoom in" title="Y-axis zoom in"/>').appendTo("#placeholdertop").click(function (e) {
        plot.xzoomrange = plot.getAxes().xaxis.options.zoomRange;
        plot.getAxes().xaxis.options.zoomRange = false;
        plot.getAxes().yaxis.options.zoomRange = [0,100-frvtop.ymin];
        plot.zoom();
        plot.getAxes().yaxis.options.zoomRange = false;
        plot.getAxes().xaxis.options.zoomRange = plot.xzoomrange;
    });
    $('<img id="ytopzoomoutbutton" class="button" src="img/zout.png" alt="Y-axis zoom out" title="Y-axis zoom out" style="right: 25px; top: 25px"/>').appendTo("#placeholdertop").click(function (e) {
        plot.xzoomrange = plot.getAxes().xaxis.options.zoomRange;
        plot.getAxes().xaxis.options.zoomRange = false;
        plot.getAxes().yaxis.options.zoomRange = [0,100-frvtop.ymin];
        plot.zoomOut();
        plot.getAxes().yaxis.options.zoomRange = false;
        plot.getAxes().xaxis.options.zoomRange = plot.xzoomrange;
    });

}

function addControl(plot) {
    var plotoffset = plot.getPlotOffset(),
        los = plotoffset['left'],
        bos = plotoffset['bottom'],
        tos = plotoffset['top'],
        ros = plotoffset['right'];
    var placeholder = plot.getPlaceholder();

    // add zooming buttons 
    $('<img id="zoominbutton" class="button" src="img/zin.png" alt="X-axis zoom in" title="X-axis zoom in" style="right:'+(ros+5)+'px;bottom:'+(bos+55)+'px"/>').appendTo(placeholder).click(function (e) {
        plot.zoom();
    });
    $('<img id="zoomoutbutton" class="button" src="img/zout.png" alt="X-axis zoom out" title="X-axis zoom out" style="right:'+(ros+5)+'px;bottom:'+(bos+30)+'px"/>').appendTo(placeholder).click(function (e) {
        plot.zoomOut();
    });
    $('<img id="resetbutton" class="button" src="img/reset.png" alt="reset all" title="reset all" style="right:'+(ros+5)+'px;bottom:'+(bos+5)+'px"/>').appendTo(placeholder).click(function (e) {
        update();
    });

    // add resizing buttons x-axis
    var ptop = $("#placeholdertop");
    var pbottom = $("#placeholderbottom");
    $('<img id="mright" class="button" src="img/mright.png" alt="increase plot width" title="increase plot width" style="right:'+(ros+55)+'px;bottom:'+(bos+5)+'px"/>').appendTo(placeholder).click(function (e) {
        var ww1 = placeholder.width()+80;
        placeholder.width(ww1);
        ptop.width(ww1);
        pbottom.width(ww1);
    });
    $('<img id="mleft" class="button" src="img/mleft.png" alt="decrease plot width" title="decrease plot width" style="right:'+(ros+30)+'px;bottom:'+(bos+5)+'px"/>').appendTo(placeholder).click(function (e) {
        var ww1 = Math.max(placeholder.width()-80,600);
        placeholder.width(ww1);
        ptop.width(ww1);
        pbottom.width(ww1);
    });

    // add resizing buttons
    $('<img id="mdownbutton" class="button" src="img/mdown.png" alt="increase plot height" title="increase plot height" style="left:'+(los+55)+'px;bottom:'+(bos+5)+'px"/>').appendTo(placeholder).click(function (e) {
        placeholder.height(placeholder.height()+40);
    });
    $('<img id="mupbutton" class="button" src="img/mup.png" alt="decrease plot height" title="decrease plot height" style="left:'+(los+30)+'px;bottom:'+(bos+5)+'px"/>').appendTo(placeholder).click(function (e) {
        placeholder.height(Math.max(placeholder.height()-40,400));
    });
    
    // add zooming buttons for Y axis
    $('<img id="yzoominbutton" class="button" src="img/zin.png" alt="Y-axis zoom in" title="Y-axis zoom in" style="left:'+(los+5)+'px;bottom:'+(bos+55)+'px"/>').appendTo(placeholder).click(function (e) {
        plot.xzoomrange = plot.getAxes().xaxis.options.zoomRange;
        plot.getAxes().xaxis.options.zoomRange = false;
        plot.getAxes().yaxis.options.zoomRange = [5,100-frv.ymin];
        plot.zoom();
        plot.getAxes().yaxis.options.zoomRange = false;
        plot.getAxes().xaxis.options.zoomRange = plot.xzoomrange;
    });
    $('<img id="yzoomoutbutton" class="button" src="img/zout.png" alt="Y-axis zoom out" title="Y-axis zoom out" style="left:'+(los+5)+'px;bottom:'+(bos+30)+'px"/>').appendTo(placeholder).click(function (e) {
        plot.xzoomrange = plot.getAxes().xaxis.options.zoomRange;
        plot.getAxes().xaxis.options.zoomRange = false;
        plot.getAxes().yaxis.options.zoomRange = [5,100-frv.ymin];
        plot.zoomOut();
        plot.getAxes().yaxis.options.zoomRange = false;
        plot.getAxes().xaxis.options.zoomRange = plot.xzoomrange;
    });
    $('<img id="yresetbutton" class="button" src="img/yreset.png" alt="Y-axis reset" title="Y-axis reset" style="left:'+(los+5)+'px;bottom:'+(bos+5)+'px"/>').appendTo(placeholder).click(function (e) {
        plot.getAxes().yaxis.options.max = 100;
        plot.getAxes().yaxis.options.min = frv.ymin;
        plot.setupGrid();
        plot.draw();
    });
}

var alpha = 0.5;
var colorseries = ["rgba(255,0,0,"+alpha+")","rgba(0,255,0,"+alpha+")","rgba(0,0,255,"+alpha+")","rgba(235,235,0,"+alpha+")","rgba(255,0,255,"+alpha+")","rgba(0,255, 255,"+alpha+")","rgba(255,140,0,"+alpha+")","rgba(106,90,205,"+alpha+")"];
