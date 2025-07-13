import asyncio
import ssl
import json
import traceback

# honestly no idea what this patch does
ssl._create_default_https_context = ssl._create_unverified_context

# patch http.client to handle IncompleteRead exceptions
# import http.client
# from http.client import IncompleteRead
# _orig_read = http.client.HTTPResponse.read
# def _safe_read(self, amt=None):
#     try:
#         return _orig_read(self, amt)
#     except IncompleteRead as e:
#         # Return whatever was read so far and suppress the exception
#         return e.partial
# http.client.HTTPResponse.read = _safe_read
# patch cookie processor so we can know the cookies
import urllib.request
import http.cookiejar as cj
current_jar = None
current_cookies = None
original_cookieprocessor = urllib.request.HTTPCookieProcessor
class CookiePatch(original_cookieprocessor):
    def __init__(self, cookiejar):
        super().__init__(cookiejar)
        global current_jar
        current_jar = cookiejar
urllib.request.HTTPCookieProcessor = CookiePatch

# patch calls that have to be proxied to be async, also block headers



# def chromeify_cookies(cookies: cj.CookieJar):
#     out = []
#     for cookie in cookies:
#         out.append({
#             "name": cookie.name,
#             "value": cookie.value,
#             "domain": cookie.domain,
#             "path": cookie.path,
#             "secure": cookie.secure,
#             "httpOnly": cookie.has_nonstandard_attr("HttpOnly"),
#             "sameSite": cookie.get_nonstandard_attr("SameSite", None),
#             "expirationDate": cookie.expires if cookie.expires != 0 else None,
#             "session": cookie.expires == 0,
#         })
#     return out

# patch send with multiple things
import pyodide_http
import pyodide_http._core
original_pyodidesend = pyodide_http._core.send
from pyodide.ffi import run_sync, to_js
from email.parser import Parser
def modified_pyodidesend(request, stream=False):
    # print(request)
    proxy = False
    credentials = False
    # these headers cannot be modified directly, but they are needed, so requests are proxied through a content script
    proxy_headers = ["origin"]
    # the browser doesnt let you set these
    blocked_headers = ['sec-fetch-mode', 'accept-encoding', "origin", "referer", "user-agent", "cookie", "cookie2"]
    # we cant directly set cookie headers, but we can ask the browser to include credentials if yt-dlp wishes to set them
    credentials_headers = ["cookie", "cookie2"]
    # handle headers
    new_headers = {}
    for header, value in request.headers.items():
        # dont add headers that are not allowed
        if header.lower() in blocked_headers:
            # print("Blocked header:", header, value)
            # signal we need to proxy this request
            if header.lower() in proxy_headers:
                proxy = True
            # signal we need to include credentials
            if header.lower() in credentials_headers:
                credentials = True
        else:
            # print("Allowed header:", header, value)
            new_headers[header] = value
    request.headers = new_headers
    from js import force_cookies, Object, set_credential_mode
    if proxy:
        if stream:
            raise Exception("Attempted to stream through proxy, which isnt supported.")
        from js import proxy_fetch
        # pyodide wont convert custom objects by default, so parse them out
        jsified_request = {
            "method": request.method,
            "url": request.url,
            "params": request.params,
            "body": request.body,
            "headers": request.headers,
            "timeout": request.timeout,
            "credentials": credentials,
        }
        # TODO: im aware sometimes yt-dlp doesnt want the exact cookies the browser has,
        #  but setting cookies is a hard and janky process
        # print(current_cookies)
        # oldcookies = run_sync(force_cookies(to_js(chromeify_cookies(current_cookies), dict_converter=Object.fromEntries)))
        # block until async js request is done
        js_response = run_sync(proxy_fetch(to_js(jsified_request, dict_converter=Object.fromEntries)))

        # run_sync(force_cookies(oldcookies))
        # idfk, ripped from pyodide
        headers = dict(Parser().parsestr(js_response["headers"]))
        # expected response object
        response = pyodide_http._core.Response(
            status_code=js_response["status_code"],
            headers=headers,
            body=js_response["body"]
        )
        return response
    else:
        # print(current_cookies)
        # oldcookies = run_sync(force_cookies(chromeify_cookies(to_js(current_cookies, dict_converter=Object.fromEntries))))
        set_credential_mode(credentials)
        # print("stream", stream)
        # try:
        #     nonlocal out
        response = original_pyodidesend(request, stream)
        # print(out.headers)
        # print(out)
        # except Exception as e:
        #     print("Error in modified_pyodidesend:", e)
        #     traceback.print_exc()
        #     raise e
        # print("pyodide send finished? like is it finishing?")
        # run_sync(force_cookies(oldcookies))
    """
    Ok so, pyodide_http reconstructs a raw HTTP response from the body that XHR returns. Problem is, XHR handles 
    things like gzip and chunking, so if we leave those headers, and send it to python's http, it freaks out trying
    to decode nonsense. super simple fix, we just remove the transfer-encoding header, and it behaves like normal
    bytes, and thats fine
    """
    if "transfer-encoding" in response.headers:
        del response.headers["transfer-encoding"]
    return response
pyodide_http._core.send = modified_pyodidesend

# patch some weird pyodide http bug, and listen for urlopen calls to get cookies
import pyodide_http._urllib
original_urlopen = pyodide_http._urllib.urlopen
def modified_urlopen(url, *args, **kwargs):
    # print("modified urlopen call")
    if isinstance(url, urllib.request.Request):
        # print("adding cookies")
        # print(current_jar)
        current_jar.add_cookie_header(url)
        # global current_cookies
        # try:
        #     current_cookies = current_jar._cookies_for_request(url)
        # except Exception as e:
        #     print(e)
        #     traceback.print_exc()
    response = original_urlopen(url, *args, **kwargs)
    if isinstance(url, pyodide_http._urllib.urllib.request.Request):
        response.url = url.full_url
    else:
        response.url = url
    return response
pyodide_http._urllib.urlopen = modified_urlopen
pyodide_http.patch_all()

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
