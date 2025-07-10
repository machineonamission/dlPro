import asyncio
import http
import ssl
import urllib
import subprocess

ssl._create_default_https_context = ssl._create_unverified_context

import pyodide_http

pyodide_http.patch_all()

original_urlopen = pyodide_http._urllib.urlopen


def modified_urlopen(url, *args, **kwargs):
    response = original_urlopen(url, *args, **kwargs)
    if isinstance(url, pyodide_http._urllib.urllib.request.Request):
        response.url = url.full_url
    else:
        response.url = url
    return response


pyodide_http._urllib.urlopen = modified_urlopen



from yt_dlp import YoutubeDL

import yt_dlp.utils._utils



orig_popen = yt_dlp.utils._utils.Popen

class PopenPatch(orig_popen):
    def __init__(self, *args, **kwargs):
        raise Exception("yt-dlp called Popen directly instead of .run(), this isnt supported.")
    @classmethod
    def run(cls, *args, **kwargs):
        if args[0][0] == "ffmpeg":
            from js import ffmpegbridge
            return asyncio.run(ffmpegbridge(args[1:]))
        else:
            raise Exception(f"yt-dlp attempted to call {args}, which isnt supported.")


yt_dlp.utils._utils.Popen = PopenPatch

ydl_opts = {
    "outtmpl": "/dl/%(title)s [%(id)s].%(ext)s.",
    "format": "bestvideo+bestaudio/best",
    "cookiefile": "/cookies.txt"
}

filename = None

with YoutubeDL(ydl_opts) as ydl:
    info_dict = ydl.extract_info("https://www.youtube.com/watch?v=EX_8ZjT2sO4", download=False)
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
    filename = ydl.prepare_filename(info_dict)
    ydl.process_info(info_dict)

print(filename)
filename
