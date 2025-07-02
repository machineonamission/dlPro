
import ssl
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

ydl_opts = {
    "outtmpl": "/dl/%(title)s [%(id)s].%(ext)s.",
}

filename = None

with YoutubeDL(ydl_opts) as ydl:
    info_dict = ydl.extract_info("https://www.youtube.com/watch?v=cvdD7uyw2NE", download=False)
    filename = ydl.prepare_filename(info_dict)
    ydl.process_info(info_dict)

print(filename)
filename