import os,sys
import json
import shutil
import urllib
import re
import gzip,operator,random,math
from Bio.Blast import NCBIStandalone
from xml.dom.minidom import parseString

SITE='site'
EVALUE_CUTOFF = 0.001
threshold = 1900000000
DATA = 'data'

def usage():
    print 'USAGE: '+sys.argv[0]+' alignment_files_index'
    sys.exit(1)

pattern_non_decimal = re.compile(r'[^\d.]+')
def featureTable(gi):
    """Get feature table from NCBI"""
    features = []
    feature = {}
    url = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&rettype=ft&retmode=text&id='+gi
    for ln in urllib.urlopen(url):
        ln = ln.rstrip()
        if not ln:
            continue
        if ln.startswith('>'):
            continue
        if ln.startswith('\t\t\t'):
            fields = ln.split()
            if fields[0] == 'product':
                feature['product'] = ' '.join(fields[1:])
            elif fields[0] == 'db_xref':
                feature['id'] = fields[1]
        elif (not ln.endswith('gene')) and len(ln.split()) == 3:
            startpos, endpos, gtype = ln.split()
            startpos = pattern_non_decimal.sub('',startpos)
            endpos = pattern_non_decimal.sub('',endpos)
            startpos = int(startpos)
            endpos = int(endpos)
            if endpos > startpos:
                feature['startpos'] = startpos
                feature['endpos'] = endpos
                feature['strand'] = '1'
            else:
                feature['startpos'] = endpos
                feature['endpos'] = startpos
                feature['strand'] = '-1'
            feature['gtype'] = gtype
        if feature.has_key('startpos') and feature.has_key('endpos') and feature.has_key('strand') and feature.has_key('gtype') and feature.has_key('id') and feature.has_key('product'):
            features.append(feature)
            feature = {}

    #sort by starting position
    features.sort(key=lambda f: f['startpos'])

    return features

pattern_defline = re.compile('<TSeq_defline>(.+)</TSeq_defline>')

def gi2length(gi):
    url = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=nuccore&report=gilist&retmode=text&id='+str(gi)
    ret = urllib.urlopen(url).read()
    dom = parseString(ret)
    length = 0
    for e in dom.getElementsByTagName('Item'):
        if e.getAttribute('Name') == 'Length':
            length = int(e.childNodes[0].data)
    return length

def gi2def(gi):
    """Gget definition line of genome from NCBI"""
    ret = ''
    url = 'http://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=nuccore&rettype=fasta&retmode=xml&id='+gi
    for ln in urllib.urlopen(url):
        match = re.search(pattern_defline, ln)
        if match:
            ret = match.groups()[0]
            break
    return ret

def refgenome2json(gi):
    """Convert features of reference genome into JSON file"""
    defline = gi2def(gi)
    features = featureTable(gi)
    dir = os.path.join(SITE,'data','GI'+gi)
    if not os.path.exists(dir):
        os.mkdir(dir)
    jsonobj = {}
    jsonobj['tag'] = 'genomeannotation'
    jsonobj['data'] = []
    for f in features:
        if f['gtype'] == 'CDS':
            gtype = 'p'
        elif f['gtype'] == 'rRNA':
            gtype = 'r'
        elif f['gtype'] == 'tRNA':
            gtype = 't'
        else:
            continue
        pass
        jsonobj['data'].append([f['startpos'],f['endpos'],int(f['strand']),gtype,f['id'],f['product']])
    try:
        jsonfile = open(os.path.join(dir,'GI'+gi+'-Ref.json'),'w')
    except:
        print >>sys.stderr, 'Failed to open ref file for GI'+gi
        return 1
    jsonfile.write(json.dumps(jsonobj, separators=(',',':')))
    jsonfile.close()
    return 0

def frhit2data(filehandle): #FIXME check new frhit output format
    """FRHIT output to data dict"""
    data = {}
    for ln in filehandle:
        ln = ln.strip()
        if not ln: continue
        if ln.startswith('#'): continue
        fields = ln.split()
        readname = fields[0]
        evalue = float(fields[2])
        if evalue > EVALUE_CUTOFF:
            continue
        alignlength = fields[3]
        identity = fields[7][:-1]
        start = int(fields[9])
        end = int(fields[10])
        if not fields[8].startswith('gi|'):
            print >>sys.stderr, 'Warning: Ref genome title not in "> gi|123123" format'
            continue
        refgi = fields[8].split('|')[1]
        if not data.has_key(refgi):
            data[refgi] = []
        if not refgi in references:
            references.append(refgi)
            refgenome2json(refgi)
        if not refLengths.has_key(refgi):
            refLengths[refgi] = gi2length(refgi)
        data[refgi].append([start,round(float(identity),1),end,readname])
    return data

def sam2data(filehandle): #FIXME proper identity
    """SAM output to data dict"""
    data = {}
    for ln in filehandle:
        ln = ln.strip()
        if not ln: continue
        if ln.startswith('@'): continue
        fields = ln.split()
        if not fields[2].startswith('gi|'):
            print >>sys.stderr, 'Warning: Ref genome title not in "> gi|123123" format'
            continue
        refgi = fields[2].split('|')[1]
        readname = fields[0]
        alignlength = len(fields[9])
        identity = 100*float(re.search(r'(\d+)M',fields[5]).group(1))/alignlength
        start = int(fields[3])
        end = start + alignlength - 1
        if not data.has_key(refgi):
            data[refgi] = []
        if not refgi in references:
            references.append(refgi)
            refgenome2json(refgi)
        if not refLengths.has_key(refgi):
            refLengths[refgi] = gi2length(refgi)
        data[refgi].append([start,round(identity,1),end,readname])
    return data

def blast2data(filehandle):
    """BLAST output to data dict"""
    data = {}
    blast_parser = NCBIStandalone.BlastParser()
    blast_iterator = NCBIStandalone.Iterator(filehandle, blast_parser)
    for blast_record in blast_iterator:
        readname = blast_record.query.split()[0]
        for alignment in blast_record.alignments:
            fields = alignment.title[1:].strip().split('|')
            if fields[0] != 'gi' or not fields[1].isdigit():
                print >>sys.stderr, 'Warning: Ref genome title not in "> gi|123123" format'
                continue
            refgi = fields[1]
            for hsp in alignment.hsps:
                if hsp.expect > EVALUE_CUTOFF:
                    continue
                identity = round(float(hsp.identities[0])*100/hsp.identities[1],1)
                start = hsp.sbjct_start
                end = hsp.sbjct_end
                if start > end:
                    tmp = start
                    start = end
                    end = tmp
                if not data.has_key(refgi):
                    data[refgi] = []
                if not refgi in references:
                    references.append(refgi)
                    refgenome2json(refgi)
                if not refLengths.has_key(refgi):
                    refLengths[refgi] = gi2length(refgi)
                data[refgi].append([start,identity,end,readname])
    return data

def data2json(data,sampleid,samplename):
    """data dict to json file"""
    for d in data:
        dir = os.path.join(SITE,'data','GI'+d)
        if not os.path.exists(dir):
            os.mkdir(dir)
        maxratio = int(math.log(int(refLengths[d]),2))-4 ##skip overly zoomed out levels
        for l in range(0,maxratio+1):
            try:
                jsonfile = open(os.path.join(dir,'GI'+d+'-'+sampleid+'-L'+str(l)+'.json'),'w')
            except:
                print >>sys.stderr, 'Failed to open data json file for GI'+gi+' and sample '+sampleid
                continue
            jsonobj = {}
            jsonobj['label'] = sampleid
            if l == 0:
                jsonobj['data'] = data[d]
            else:
                jsonobj['data'] = getOutline(data[d],l)
            jsonfile.write(json.dumps(jsonobj, separators=(',',':')))
            jsonfile.close()

def parseData(inputfile,sampleid,samplename,informat):
    """Switch for differenct input data file format"""
    if informat == 'frhit':
        data2json(frhit2data(open(inputfile)),sampleid,samplename)
    elif informat == 'blast':
        data2json(blast2data(open(inputfile)),sampleid,samplename)
    elif informat == 'sam':
        data2json(sam2data(open(inputfile)),sampleid,samplename)
    else:
        print >>sys.stderr, 'Unrecognized alignment file format'

def createIndexFiles():
    """Create data index files in 'data' directory"""
    refindex = open(os.path.join(SITE,'data','references.list'),'w')
    for gi in references:
        refindex.write(gi+'|'+gi2def(gi)+'|'+str(refLengths[gi])+'\n')
    refindex.close()
    sampleindex = open(os.path.join(SITE,'data','samples.list'),'w')
    for s in samples:
        sampleindex.write(s[0]+'|'+s[1]+'\n')
    sampleindex.close()

def checkShow(frags):
    """check if a fragment in a series is shown or not, based
    on overlapping. Assuming frags are sorted by length in descending order"""
    registeredArea = []
    newfrags = []
    for p in frags:
        startArea = -1
        endArea = -1
        for r in range(len(registeredArea)):
            thisArea = registeredArea[r]
            if thisArea[0]<p[0]<thisArea[1]:
                startArea = r
            if thisArea[0]<p[2]<thisArea[1]:
                endArea = r
        ##print p[0],p[2],"start/end:",startArea,endArea #debug
        if startArea == -1 and endArea == -1:
            show = True
            registeredArea.append([p[0],p[2]])
        elif startArea == -1 and endArea > -1:
            show = True
            registeredArea[endArea][0] = p[0]
        elif startArea > -1 and endArea == -1:
            show = True
            registeredArea[startArea][1] = p[2]
        else:
            if startArea == endArea:
                show = False
            else:
                show = True
                registeredArea[startArea][1] = registeredArea[endArea][1]
                del registeredArea[endArea]
        ##print 'registerdArea:',registeredArea #debug
        newp = list(p)
        if show:
            newp.append(1)
        else:
            newp.append(0)
        newp = tuple(newp)
        newfrags.append(newp)
    return newfrags

def processHits(hits):
    levels = {}
    for h in hits:
        ident = h[1]
        if levels.has_key(ident):
            levels[ident].append(h)
        else:
            levels[ident] = [h]
    ret = []
    for l in levels:
        thislevel = levels[l]
        ## sort by lengh for each identity level
        thislevel.sort(key=lambda hit: hit[2]-hit[0], reverse=1)
        ## score by overlapping status
        thislevelnew = checkShow(thislevel)
        ret.extend(thislevelnew)
    return ret

def getOutlineSingleY(hits, ratio):
    """Assuming hits are sort by length in descending order"""
    ratioreal = 2**ratio
    outlines = []
    for h in hits:
        startArea = -1
        endArea = -1
        startPos = int(h[0]/ratioreal)
        endPos = int(h[2]/ratioreal)
        #print h[0],'=>',startPos,h[2],'=>',endPos #debug
        for r in range(len(outlines)):
            thisArea = outlines[r]
            if thisArea[0] <= startPos <= thisArea[1]:
                startArea = r
            if thisArea[0] <= endPos <= thisArea[1]:
                endArea = r
        if startArea == -1 and endArea == -1:
            outlines.append([startPos,endPos])
        elif startArea == -1 and endArea > -1:
            outlines[endArea][0] = startPos
        elif startArea > -1 and endArea == -1:
            outlines[startArea][1] = endPos
        elif startArea != endArea:
            outlines[startArea][1] = outlines[endArea][1]
            del outlines[endArea]
    for r in range(len(outlines)):
        outlines[r] = (int(outlines[r][0]*(ratioreal)),int(outlines[r][1]*(ratioreal)))
    return outlines

def getOutline(hits, ratio):
    yvalues = {}
    for h in hits:
        y = h[1]
        if yvalues.has_key(y):
            yvalues[y].append(h)
        else:
            yvalues[y] = [h]
    hits_outline = []
    for y in yvalues:
        thisy = yvalues[y]
        ## sort by lengh for each identity level
        thisy.sort(key=lambda hit: hit[2]-hit[0], reverse=1)
        thisy_new = getOutlineSingleY(thisy, ratio)
        for i in range(len(thisy_new)):
            thisy_new[i] = (thisy_new[i][0],y,thisy_new[i][1])
        hits_outline.extend(thisy_new)
    return hits_outline

def frag2coverage(fragjson):
    cvrg = {}
    jsonobj = json.loads(fragjson)
    dataobj = jsonobj['data']
    label = jsonobj['label']
    for p in dataobj:
        start = p[0]
        end = p[2]
        for i in range(start,end+1):
            if cvrg.has_key(i):
                cvrg[i] += 1
            else:
                cvrg[i] = 1
    cvrg = cvrg.items()
    cvrg.sort(key=operator.itemgetter(0))

    opt_reduce = True
    opt_threshold = 10 

    data = [] 
    lastvalue = -99999
    lastpos = -1

    for c in cvrg:
        x = c[0]
        #y = math.log10(c[1])
        y = c[1]
        if (x - lastpos) > 1:
            data.append([lastpos+1,0])
            if (x - lastpos) > 2:
                data.append([x-1,0])
            data.append([x,y]) 
            lastvalue = y
        else:
            if opt_reduce:
                if abs(y - lastvalue) > opt_threshold:
                    data.append([x,y])
                    lastvalue = y
            else:
                data.append([x,y])
                lastvalue = y
        lastpos = x

    jsonobj = {'label':label,'tag':'coverage','data':data}
    return json.dumps(jsonobj,separators=(',',':'))

####MAIN###
if len(sys.argv) < 2:
    usage()

alignment_file_index = sys.argv[1]
#each line alignment file index should be in the following format:
#alignment_file_name sample_id sample_name alignment_method

###create directories
if not os.path.exists(SITE):
    os.mkdir(SITE)
datadir = os.path.join(SITE,'data')
if not os.path.exists(datadir):
    os.mkdir(datadir)

###parse alignment files and create json data files
samples = []
references = []
refLengths = {}
for ln in open(alignment_file_index):
    ln = ln.strip()
    if not ln:
        continue
    if ln.startswith('#'):
        continue
    try:
        alignment_file_name,sample_id,sample_name,alignment_method = ln.split()[:4]
    except:
        print >>sys.stderr, 'Alignment index error:',ln
        sys.exit(1)
    samples.append((sample_id,sample_name))
    if not alignment_method in ('frhit','blast','sam'):
        print >>sys.stderr, 'Unrecognized alignment file format'
        continue
    print '>>Parsing sample '+sample_id
    parseData(alignment_file_name,sample_id,sample_name,alignment_method)

###create coverage json files
for r in references:
    for s in samples:
        inputjson = open(os.path.join(SITE,'data','GI'+r,'GI'+r+'-'+s[0]+'-L0.json')).readline().strip()
        outputjson = frag2coverage(inputjson)
        print >>open(os.path.join(SITE,'data','GI'+r,'GI'+r+'-'+s[0]+'-Coverage.json'),'w'),outputjson

###create index files
createIndexFiles()

###create stats file
def frag2stat(fragjson):
    cvrg = {}
    jsonobj = json.loads(fragjson)
    dataobj = jsonobj['data']
    return len(dataobj)

stats = {}

for ln in open(os.path.join(SITE,'data','references.list')):
    ln = ln.strip()
    if not ln:
        continue
    gi = ln.split('|')[0]
    for ln2 in open(os.path.join(SITE,'data','samples.list')):
        ln2 = ln2.strip()
        if not ln2:
            continue
        sampleid = ln2.split('|')[0]
        inputjson = open(os.path.join(SITE,'data','GI'+gi+'/GI'+gi+'-'+sampleid+'-L0.json')).readline().strip()
        numHits = frag2stat(inputjson)
        stats[gi+'|'+sampleid] = numHits

statsfile = open(os.path.join(SITE,'data','stats.json'),'w')
print >>statsfile, json.dumps(stats,separators=(',',':'))
statsfile.close()

###create html index file
htmlfile = open(os.path.join(SITE,'index.html'),'w')
htmlfile.write("""<!doctype html>
<html lang="en">
 <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <title>MGAviewer</title>
    <link href="css/layout.css" rel="stylesheet" type="text/css">
    <!--[if lte IE 8]><script language="javascript" type="text/javascript" src="script/excanvas.min.js"></script><![endif]-->
    <script language="javascript" type="text/javascript" src="script/jquery-flot-frag-navigate-resize-genomeannotation.js"></script>
    <script language="javascript" type="text/javascript" src="script/site.js"></script>
 </head>
 <body>
    <div id="loader">Loading... Please wait</div> 
    <div id="banner">MGAviewer - Metagenomic Alignment Viewer</div>
    <div id="main">
    <div id="plotcontainer">
    <table>
        <tr>
        <td></td>
        <td>
        <div style="width:900px;text-align:right;font-size:0.6em;"><span id="togglelegend" style="background:#555;color:#fff;padding:3px;font-weight:bold;cursor:pointer">Toggle Legend</span></div>
        </td>
        </tr>
        <tr>
        <td><img src="img/ylabel_coverage.png" class="ylabel"/></td>
        <td>
        <div id="placeholdertop"></div>
        </td>
        </tr>
        <tr>
        <td><img src="img/ylabel_identity.png" class="ylabel"/></td>
        <td>
        <div id="placeholdermain"></div>
        </td>
        </tr>
        <tr>
        <td><img src="img/ylabel_ref.png" class="ylabel"/></td>
        <td>
        <div id="placeholderbottom"></div>
        <div id="xaxislabel"></div>
        <div id="extlegend">Annotation: <span class="legendfrag" style="background:#0000FF">Protein</span><span class="legendfrag" style="background:#DD5E04">rRNA</span><span class="legendfrag" style="background:#9FC40A">tRNA</span></div>
        </td>
        </tr>
    </table>
    </div>
    <div id="selections">
        <div style="text-align:center;margin:3px"><button class="updatebutton" style="width:100px;font-weight:bold">Update</button></div>
        <div id="seleref" class="selector" style="float:left"><h4>References</h4>
            <div class="selected"></div>
            <div class="listdivider"></div>
            <div class="selelist">
""")

#write reference list
checked = False
for ln in open(os.path.join(SITE,'data','references.list')):
    ln = ln.strip()
    if not ln:
        continue
    refid,refdesc,reflength = ln.split('|')
    lnstring = '<div title="'+refdesc+'" class="matched"><input type="radio" name="ref" value="'+refid+'" length="'+reflength+'"'
    if not checked:
        lnstring += ' checked=true'
        checked = True
    lnstring += '/><b>[GI:'+refid+'</b> '+refdesc+'</div>\n'
    htmlfile.write(lnstring)

htmlfile.write("""
            </div>
        <div class="schbox"><input id="schref"><button class="btnsch">Search</button><button class="btnrst">Reset</button></div>
        </div>
        <div id="selesample" class="selector" style="float:right"><h4>Samples</h4>
            <div class="selected"></div>
            <div class="listdivider"></div>
            <div class="selelist">
""")
#write sample list
checked = False
for ln in open(os.path.join(SITE,'data','samples.list')):
    ln = ln.strip()
    if not ln:
        continue
    sampleid,sampledesc = ln.split('|')
    lnstring = '<div title="'+sampledesc+'" class="matched"><input type="checkbox" value="'+sampleid+'"'
    if not checked:
        lnstring += ' checked=true'
        checked = True
    lnstring += '/><b>['+sampleid+']</b> '+sampledesc+'</div>\n'
    htmlfile.write(lnstring)

htmlfile.write("""
            </div>
        <div class="schbox"><input id="schsample"><button class="btnsch">Search</button><button class="btnrst">Reset</button></div>
        <div class="clear"></div>
    </div><!--//selections-->
    </div><!--//main-->
    <div id="debug" style="position:fixed;top:0;right:0;width:100px;min-height:60px;background:#700;color:#fff;display:none"></div>
 </body>
</html>
""")

htmlfile.close()

###copy other files (image, JavaScript, CSS...)
try:
    shutil.copytree('css',os.path.join(SITE,'css'))
    shutil.copytree('script',os.path.join(SITE,'script'))
    shutil.copytree('img',os.path.join(SITE,'img'))
except:
    print >>sys.stderr, 'Failed to copy files'
    sys.exit(2)

print 'Complete'
