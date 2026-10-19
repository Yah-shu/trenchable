"""Coloured depth video with Video Depth Anything Small (Apache-2.0, DepthAnything/Video-Depth-Anything).
Runs on the GPU (NVIDIA CUDA / AMD ROCm, fp16), on Apple MPS, or on the CPU (slow); MPS and CPU use fp32.
usage: depth.py --in clip.mp4 --out DIR [--max-side 960] [--fps 24] [--colormap turbo|gray|inferno] [--fp32]
-> RESULT {"depth": "DIR/depth.mp4", "depth_gray": "DIR/depth_gray.mp4", "normalized": "DIR/normalized.mp4",
           "frames": N, "fps": F, "size": [w, h], "colormap": "turbo"}
Near = warm/bright. Normalisation is over the whole clip (like VDA's own save_video), so colours do not flicker."""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

VDA_REPO = C.REPOS + "/Video-Depth-Anything"
WEIGHTS = C.MODELS + "/video_depth_anything_vits.pth"


def colorize(d, cmap):
    import cv2
    g = (d * 255.0).clip(0, 255).astype("uint8")
    if cmap == "gray":
        return cv2.cvtColor(g, cv2.COLOR_GRAY2RGB), g
    code = cv2.COLORMAP_INFERNO if cmap == "inferno" else cv2.COLORMAP_TURBO
    return cv2.cvtColor(cv2.applyColorMap(g, code), cv2.COLOR_BGR2RGB), g


def use_fused_attention():
    """VDA's DINOv2 attention builds the full attention matrix: about 9 GB for one 32-frame window at 518 px in fp32,
    which fills the RAM of a CPU-only computer. PyTorch's fused attention gives the same result in a fraction of the
    memory. Used on NVIDIA, Apple and the CPU; AMD ROCm keeps the plain path it was tested with (RX 6000-series
    chips have no memory-efficient attention kernel)."""
    import torch.nn.functional as F
    from video_depth_anything.dinov2_layers import attention as A

    def forward(self, x, *args, **kwargs):  # same maths as Attention.forward (scale = head_dim ** -0.5)
        B, N, Cc = x.shape
        qkv = self.qkv(x).reshape(B, N, 3, self.num_heads, Cc // self.num_heads).permute(2, 0, 3, 1, 4)
        x = F.scaled_dot_product_attention(qkv[0], qkv[1], qkv[2])
        return self.proj_drop(self.proj(x.transpose(1, 2).reshape(B, N, Cc)))
    A.Attention.forward = forward
    A.MemEffAttention.forward = forward


def load_model(device):
    import torch
    sys.path.insert(0, VDA_REPO)
    if not (torch.device(device).type == "cuda" and C.torch_backend().startswith("rocm")):
        use_fused_attention()
    from video_depth_anything.video_depth import VideoDepthAnything
    m = VideoDepthAnything(encoder="vits", features=64, out_channels=[48, 96, 192, 384], metric=False)
    m.load_state_dict(torch.load(WEIGHTS, map_location="cpu", weights_only=True), strict=True)
    return m.to(device).eval()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--max-side", type=int, default=960)
    ap.add_argument("--fps", type=float, default=24)
    ap.add_argument("--colormap", default="turbo", choices=["turbo", "gray", "inferno"])
    ap.add_argument("--fp32", action="store_true", help="full precision (slower); default is fp16 autocast on a GPU")
    a = ap.parse_args()
    src = C.need_file(a.inp)
    out = C.out_dir(a.out)
    import numpy as np

    C.progress(2, "normalising video")
    norm = os.path.join(out, "normalized.mp4")
    info = C.normalize(src, norm, a.max_side, a.fps)
    w, h = info["w"], info["h"]
    frames = np.stack(list(C.read_frames(norm, w, h)))
    n = len(frames)
    if n == 0:
        C.fail("the video has no frames")
    C.progress(8, f"loading depth model ({n} frames {w}x{h})")
    device = C.torch_device()
    model = load_model(device)

    import video_depth_anything.video_depth as vd
    steps = max(1, -(-n // (vd.INFER_LEN - vd.OVERLAP)))

    def tq(it, *k, **kw):  # report VDA's window loop as PROGRESS lines
        for i, x in enumerate(it):
            C.progress(10 + 75 * i / steps, f"depth window {i + 1}/{steps}")
            yield x
    vd.tqdm = tq
    fp32 = a.fp32 or device.type != "cuda"  # fp16 autocast only on NVIDIA/AMD GPUs
    depths, _ = model.infer_video_depth(frames, a.fps, input_size=518, device=device.type, fp32=fp32)
    depths = np.asarray(depths[:n], dtype=np.float32)
    del frames
    lo, hi = float(depths.min()), float(depths.max())
    depths = (depths - lo) / max(hi - lo, 1e-6)

    C.progress(86, "writing depth videos")
    col_path, gray_path = os.path.join(out, "depth.mp4"), os.path.join(out, "depth_gray.mp4")
    wc, wg = C.Writer(col_path, w, h, a.fps, crf=14), C.Writer(gray_path, w, h, a.fps, crf=14)
    for i, d in enumerate(depths):
        rgb, g = colorize(d, a.colormap)
        wc.write(rgb)
        wg.write(np.repeat(g[:, :, None], 3, axis=2))
        if i % 24 == 0:
            C.progress(86 + 13 * i / n, "writing depth videos")
    wc.close()
    wg.close()
    C.result({"depth": C.path_out(col_path), "depth_gray": C.path_out(gray_path), "normalized": C.path_out(norm),
              "frames": n, "fps": a.fps, "size": [w, h], "colormap": a.colormap})


if __name__ == "__main__":
    C.run_main(main)
