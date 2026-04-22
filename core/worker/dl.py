# import snoop
# snoop.install()
# import pydevd_pycharm
# pydevd_pycharm.settrace('localhost', port=6968, stdout_to_server=True, stderr_to_server=True)

# import asyncio
# import ssl
import json
import importlib
import io
# import traceback
# import sys
#
# sys.path.insert(0, "/modules")
import pyodide_http_fork as pyodide_http

# patch urllib to use browser
pyodide_http.patch_ssl()
pyodide_http.patch_urllib()
# print(pyodide_http)
# print(pyodide_http.__version__)
# import urllib.request
# print(urllib.request.urlopen("test"))

from pyodide.ffi import run_sync
# patch yt-dlp to not call subprocesses, but to call ffmpeg.wasm
from yt_dlp.utils import _utils
from yt_dlp.postprocessor import ffmpeg
from yt_dlp import downloader
from js import ffmpegbridge, Object, ask_user_for_format, request_js
from pyodide.ffi import to_js


# import pyodide.ffi

# run_sync_orig = pyodide.ffi.run_sync

def run_sync_wrapper(func):
    try:
        return run_sync(func)
    except RuntimeError as e:
        from js import firefox_jspi_warning
        firefox_jspi_warning()
        print("Sending Firefox JSPI warning")
        # raise


# pyodide.ffi.run_sync = run_sync_wrapper

if importlib.util.find_spec("yt_dlp.extractor.youtube.jsc"):
    print("yt-dlp supports JS challenges. adding dlPro's JSC handler.")
    from yt_dlp.extractor.youtube.jsc.provider import (
        register_provider,
        register_preference,
    )
    from yt_dlp.extractor.youtube.jsc._builtin.deno import DenoJCP

    @register_provider
    class dlProJCP(DenoJCP):
        PROVIDER_NAME = 'dlPro'
        JS_RUNTIME_NAME = 'dlPro'

        def is_available(self, /) -> bool:
            return True

        def _run_deno(self, stdin, options) -> str:
            print("Requesting JS challenge handler...")
            res = run_sync_wrapper(
                request_js(
                    stdin
                )
            )
            print("JS challenge result received.")
            return res

        def _npm_packages_cached(self, stdin: str) -> bool:
            return False

    @register_preference(dlProJCP)
    def preference(*_) -> int:
        return 99999999999999999
else:
    print("WARNING: used version of yt-dlp does NOT support JS challenges.")


# class dlProFFmpegPP(ffmpeg.FFmpegPostProcessor):
#     @property
#     def available(self):
#         print("FORCING FFMPEG TO BE AVAILABLE!")
#         return True


# ffmpeg.FFmpegPostProcessor.available = lambda *_: True
# ffmpeg.FFmpegPostProcessor.executable = lambda *_: "ffmpeg"
# ffmpeg.FFmpegPostProcessor._determine_executables = lambda *_: {"ffmpeg":"ffmpeg", "ffprobe":"ffprobe"}

# def basename(self):
#     print("ARE YOU FUCKING THEREEEEEE")
#     _ = self._version  # run property
#     return "ffmpeg"
#
# ffmpeg.FFmpegPostProcessor.basename = basename


# downloader.FFmpegFD.available = classmethod(lambda *_: True)

    # return "", "", 1

# hijacks yt-dlp's attempts to run ffmpeg/ffprobe, and instead runs the ffmpeg.wasm bridge
def popen_run(cls, args, **kwargs):
    if args[0] in ["ffmpeg", "ffprobe"]:
        print("patched ffmpeg call ", args, kwargs)
        # we dont need to actually call ffmpeg to just get basic static info.
#         if args[0][1] == "-bsfs":
#             return json.loads(
#                 """["Bitstream filters:aac_adtstoascav1_frame_mergeav1_frame_splitav1_metadatachompdump_extradca_coredv_error_markereac3_coreextract_extradatafilter_unitsh264_metadatah264_mp4toannexbh264_redundant_ppshapqa_extracthevc_metadatahevc_mp4toannexbimxdumpmjpeg2jpegmjpegadumpmp3decompmpeg2_metadatampeg4_unpack_bframesmov2textsubnoisenullopus_metadatapcm_rechunkpgs_frame_mergeprores_metadataremove_extrasettstext2movsubtrace_headerstruehd_corevp9_metadatavp9_raw_reordervp9_superframevp9_superframe_split","ffmpeg version 5.1.4 Copyright (c) 2000-2023 the FFmpeg developers  built with emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.40 (5c27e79dd0a9c4e27ef2326841698cdd4f6b5784)  configuration: --target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags='-I/opt/include -O3 -msimd128' --extra-cxxflags='-I/opt/include -O3 -msimd128' --disable-pthreads --disable-w32threads --disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg  libavutil      57. 28.100 / 57. 28.100  libavcodec     59. 37.100 / 59. 37.100  libavformat    59. 27.100 / 59. 27.100  libavdevice    59.  7.100 / 59.  7.100  libavfilter     8. 44.100 /  8. 44.100  libswscale      6.  7.100 /  6.  7.100  libswresample   4.  7.100 /  4.  7.100  libpostproc    56.  6.100 / 56.  6.100Aborted()",0]"""
#             )
        return run_sync_wrapper(
            ffmpegbridge(
                args[0],
                to_js(args[1:], dict_converter=Object.fromEntries),
                kwargs.get("stderr", -1) == -2  # sometimes it joins stdout + stderr, we have to handle this
            )
        ).to_py()
    # if args[0] == ["deno", "--version"]:
    #     return [deno_version, "", 0]
    print(f"yt-dlp attempted to call {args}, which isnt supported.")
    # checked, this is what Popen runs if the exe isnt found, which is what we want since it essentially isnt
    raise FileNotFoundError(f"yt-dlp attempted to call {args}, which isnt supported.")


_utils.Popen.run = classmethod(popen_run)

def patched_init(self, args, *remaining, **kwargs):
    print(args,remaining, kwargs)
    stdout, stderr, self.returncode = popen_run(None, args, **kwargs)
    self.stdout = io.StringIO(stdout)
    self.stderr = io.StringIO(stderr)
    self.stdin = io.StringIO("")

_utils.Popen.__init__ = patched_init
# no waiting needed, proc is ran immediately
_utils.Popen.wait = lambda self, *_: self.returncode


from yt_dlp import YoutubeDL
from yt_dlp.postprocessor.common import PostProcessor
from js import wrap_send_to_user


# hooks into yt-dlp to send files to the user once they are downloaded
class SendToUserPP(PostProcessor):
    def __init__(self, downloader):
        super().__init__(downloader)

    def run(self, info):
        from js import console
        wrap_send_to_user(info["filepath"])
        return [], info

def live_filter(info, *, incomplete):
    if info.get("is_live"):
        return "Livestreams cannot be downloaded"

ydl_opts = {
    "outtmpl": "/dl/%(title)s [%(id)s].%(ext)s",
    "cookiefile": "/cookies.txt",
    # you need this or else yt-dlp leaves out info from the info_dict, which breaks changing formats
    "format": "all",
    "verbose": True,
    "match_filter": live_filter,  # no livestreams because they break things
    "remote_components": ["ejs:github", "ejs:npm"]
}

filename = None

# get info
with YoutubeDL(ydl_opts) as ydl:
    info_dict = ydl.extract_info(downloadURL, download=False)
    print(ydl.render_formats_table(info_dict))
    # sanitize for """json""" encoding
    info_dict_sanitized = ydl.sanitize_info(info_dict)

# delete our "all" key and let the user select
del ydl_opts["format"]

# user selections resolve as modifications to the options for simplicity
#  eg, selecting "audio" preset adds "format:audio" to the options
user_opts = run_sync_wrapper(ask_user_for_format(to_js(info_dict_sanitized, dict_converter=Object.fromEntries))).to_py()
ydl_opts |= user_opts



# now that we have the user's selection, we can download, using the existing info
with YoutubeDL(ydl_opts) as ydl:
    ydl.add_post_processor(SendToUserPP(ydl), when="after_move")

#     @snoop
    def dbg():
        ydl.process_ie_result(info_dict)

    dbg()