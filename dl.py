import asyncio
import ssl
import json
import traceback
import sys

sys.path.insert(0, "/modules")
import pyodide_http_fork as pyodide_http

# patch urllib to use browser
pyodide_http.patch_all()

from pyodide.ffi import run_sync
# patch yt-dlp to not call subprocesses, but to call ffmpeg.wasm
import yt_dlp.utils._utils as yutils
from js import ffmpegbridge, Object, ask_user_for_format
from pyodide.ffi import to_js

def popen_run(cls, *args, **kwargs):
    # we dont need to actually call ffmpeg to just get basic static info.
    if args[0] == ["ffmpeg", "-bsfs"] or args[0] == ["ffprobe", "-bsfs"]:
        return json.loads(
            """["Bitstream filters:aac_adtstoascav1_frame_mergeav1_frame_splitav1_metadatachompdump_extradca_coredv_error_markereac3_coreextract_extradatafilter_unitsh264_metadatah264_mp4toannexbh264_redundant_ppshapqa_extracthevc_metadatahevc_mp4toannexbimxdumpmjpeg2jpegmjpegadumpmp3decompmpeg2_metadatampeg4_unpack_bframesmov2textsubnoisenullopus_metadatapcm_rechunkpgs_frame_mergeprores_metadataremove_extrasettstext2movsubtrace_headerstruehd_corevp9_metadatavp9_raw_reordervp9_superframevp9_superframe_split","ffmpeg version 5.1.4 Copyright (c) 2000-2023 the FFmpeg developers  built with emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 3.1.40 (5c27e79dd0a9c4e27ef2326841698cdd4f6b5784)  configuration: --target-os=none --arch=x86_32 --enable-cross-compile --disable-asm --disable-stripping --disable-programs --disable-doc --disable-debug --disable-runtime-cpudetect --disable-autodetect --nm=emnm --ar=emar --ranlib=emranlib --cc=emcc --cxx=em++ --objcc=emcc --dep-cc=emcc --extra-cflags='-I/opt/include -O3 -msimd128' --extra-cxxflags='-I/opt/include -O3 -msimd128' --disable-pthreads --disable-w32threads --disable-os2threads --enable-gpl --enable-libx264 --enable-libx265 --enable-libvpx --enable-libmp3lame --enable-libtheora --enable-libvorbis --enable-libopus --enable-zlib --enable-libwebp --enable-libfreetype --enable-libfribidi --enable-libass --enable-libzimg  libavutil      57. 28.100 / 57. 28.100  libavcodec     59. 37.100 / 59. 37.100  libavformat    59. 27.100 / 59. 27.100  libavdevice    59.  7.100 / 59.  7.100  libavfilter     8. 44.100 /  8. 44.100  libswscale      6.  7.100 /  6.  7.100  libswresample   4.  7.100 /  4.  7.100  libpostproc    56.  6.100 / 56.  6.100Aborted()",0]"""
        )
    if args[0][0] in ["ffmpeg", "ffprobe"]:
        return run_sync(
            ffmpegbridge(
                args[0][0],
                to_js(args[0][1:], dict_converter=Object.fromEntries)
            )
        ).to_py()

    else:
        raise Exception(f"yt-dlp attempted to call {args}, which isnt supported.")


yutils.Popen.run = classmethod(popen_run)


ydl_opts = {
    "outtmpl": "/dl/%(title)s [%(id)s].%(ext)s",
    "cookiefile": "/cookies.txt"
}

import yt_dlp.YoutubeDL

filename = None


with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    info_dict = ydl.extract_info(downloadURL, download=False)
    # we need to do this if we are modifying the format, or else we get 403s
    info_dict = ydl.sanitize_info(info_dict, remove_private_keys=True)

ydl_opts["format"] = run_sync(ask_user_for_format(to_js(info_dict, dict_converter=Object.fromEntries)))
with yt_dlp.YoutubeDL(ydl_opts) as ydl:
    ydl.process_ie_result(info_dict)
