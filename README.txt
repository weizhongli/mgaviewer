VERSION: 1.3.0
=================================================================

==How to create plot from your own alignment files?==
Currently we support alignment files created bu FR-HIT and BLAST.
1. Put your alignment files in current directory, one per sample.
2. Create a sample index file in the following format on each line:
    alginment_filename sample_id sample_name alignment_method
3. Run script createSite.py by running command:

    python createSite.py sample_index_file

(Python 2.6 or newer and BioPython are required)

For example, in current directory, run command

    python createSite.py alignments.index

will create a working MGAviewer site in directory 'site'

Enter directory 'site'. Open file index.html in your browser.
If opening from local computer without web server, there might be
a problem with Chrome. If hosted on a web server, there is no
such restriction.

You can adapt it to your needs by modifying index.html, 
script/site.js and css/layout.css.

Data files in JSON format are in directory data/.

Lastest version of this software can be downloaded from
http://weizhong-lab.ucsd.edu/mgaviewer

