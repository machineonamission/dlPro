import asyncio
import ssl
import json

# honestly no idea what this patch does
ssl._create_default_https_context = ssl._create_unverified_context

# attach url open to web browser
import pyodide_http
import pyodide_http._core

# patch calls that have to be proxied to be async, also block headers
original_pyodidesend = pyodide_http._core.send
from pyodide.ffi import run_sync, to_js
from email.parser import Parser

def modified_pyodidesend(request, stream=False):
    # print(request)
    proxy = False
    # these headers cannot be modified directly, but they are needed, so requests are proxied through a content script
    proxy_headers = ["origin", "referer"]
    # the browser doesnt let you set these
    blocked_headers = ['sec-fetch-mode', 'accept-encoding', "origin", "referer", "user-agent"]
    # simultaneously block headers that arent allowed in the browser, and determine if we need to use the proxy
    new_headers = {}
    for header, value in request.headers.items():
        if header.lower() in blocked_headers:
            # print("Blocked header:", header, value)
            if header.lower() in proxy_headers:
                proxy = True
        else:
            new_headers[header] = value
    request.headers = new_headers

    if proxy:
        if stream:
            raise Exception("Attempted to stream through proxy, which isnt supported.")
        from js import proxy_fetch
        from js import Object
        # pyodide wont convert custom objects by default, so parse them out
        jsified_request = {
            "method": request.method,
            "url": request.url,
            "params": request.params,
            "body": request.body,
            "headers": request.headers,
            "timeout": request.timeout,
        }
        # block until async js request is done
        js_response = run_sync(proxy_fetch(to_js(jsified_request, dict_converter = Object.fromEntries)))
        # idfk, ripped from pyodide
        headers = dict(Parser().parsestr(js_response["headers"]))
        # expected response object
        response = pyodide_http._core.Response(
            status_code = js_response["status_code"],
            headers = headers,
            body = js_response["body"]
        )
        return response
    else:
        # if no proxy needed, just call original code.
        return original_pyodidesend(request, stream)


pyodide_http._core.send = modified_pyodidesend

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
    # we dont need to actually call ffmpeg to just get basic static info.
    if args[0] == ["ffmpeg", "-bsfs"] or args[0] == ["ffprobe", "-bsfs"]:
        return json.loads(
            """["Bitstream filters:aac_adtstoascav1_frame_mergeav1_frame_splitav1_metadatachompdump_extradca_coredv_error_markereac3_coreextract_extradatafilter_unitsh264_metadatah264_mp4toannexbh264_redundant_ppshapqa_extracthevc_metadatahevc_mp4toannexbimxdumpmjpeg2jpegmjpegadumpmp3decompmpeg2_metadatampeg4_unpack_bframesmov2textsubnoisenullopus_metadatapcm_rechunkpgs_frame_mergeprores_metadataremove_extrasettstext2movsubtrace_headerstruehd_corevp9_metadatavp9_raw_reordervp9_superframevp9_superframe_split","ffmpeg version 5.1.4 Copyright (c) 2000-2023 the FFmpeg developers  built with emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.40 (5c27e79dd0a9c4e27ef2326841698cdd4f6b5784)  configuration: --target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags='-I/opt/include -O3 -msimd128' --extra-cxxflags='-I/opt/include -O3 -msimd128' --disable-pthreads --disable-w32threads --disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg  libavutil      57. 28.100 / 57. 28.100  libavcodec     59. 37.100 / 59. 37.100  libavformat    59. 27.100 / 59. 27.100  libavdevice    59.  7.100 / 59.  7.100  libavfilter     8. 44.100 /  8. 44.100  libswscale      6.  7.100 /  6.  7.100  libswresample   4.  7.100 /  4.  7.100  libpostproc    56.  6.100 / 56.  6.100Aborted()",0]"""
        )
    if args[0][0] in ["ffmpeg", "ffprobe"]:
        from js import ffmpegbridge
        return json.loads(run_sync(ffmpegbridge(args[0][0], json.dumps(args[0][1:]))))
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
