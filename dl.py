import asyncio
import ssl
import json

# honestly no idea what this patch does
ssl._create_default_https_context = ssl._create_unverified_context

# attach url open to web browser
import pyodide_http
pyodide_http.patch_all()

# patch some weird pyodide http bug
original_urlopen = pyodide_http._urllib.urlopen
def modified_urlopen(url, *args, **kwargs):
    response = original_urlopen(url, *args, **kwargs)
    if isinstance(url, pyodide_http._urllib.urllib.request.Request):
        response.url = url.full_url
    else:
        response.url = url
    return response
pyodide_http._urllib.urlopen = modified_urlopen

# patch yt-dlp to not call subprocesses, but to call ffmpeg.wasm
import yt_dlp.utils._utils as yutils
def popen_run(cls, *args, **kwargs):
    if args[0][0] == "ffmpeg":
        from js import ffmpegbridge
        return json.loads(asyncio.run(ffmpegbridge(json.dumps(args[0][1:]))))
    else:
        raise Exception(f"yt-dlp attempted to call {args}, which isnt supported.")
yutils.Popen.run = classmethod(popen_run)

ydl_opts = {
    "outtmpl": "/dl/%(title)s [%(id)s].%(ext)s",
    "format": "bestvideo+bestaudio/best",
    "cookiefile": "/cookies.txt"
}

import yt_dlp.YoutubeDL

filename = None

with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    print("extracting info")
    info_dict = ydl.extract_info(downloadURL, download=False)
    # print(info_dict)
    if 'formats' in info_dict:
        print(f"Available formats for: {info_dict.get('title', 'Unknown Title')}")
        for format_entry in info_dict['formats']:
            format_id = format_entry.get('format_id')
            ext = format_entry.get('ext')
            resolution = format_entry.get('resolution')
            vcodec = format_entry.get('vcodec')
            acodec = format_entry.get('acodec')
            filesize = format_entry.get('filesize')
            filesize_approx = format_entry.get('filesize_approx')

            print(f"  ID: {format_id}, Ext: {ext}, Resolution: {resolution}, "
                  f"VCodec: {vcodec}, ACodec: {acodec}, "
                  f"Filesize: {filesize or filesize_approx} bytes")
    # TODO: playlist support
    print("processing info and downloading")
    ydl.process_info(info_dict)

print(filename)
filename
