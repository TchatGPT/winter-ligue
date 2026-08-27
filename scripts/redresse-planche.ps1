# Redresse la planche du booster 2 et l'installe comme sachet Blizzard.
#
# La planche est un rendu de trois quarts : bord haut incliné de 3,7°, côté
# gauche 3 % plus haut que le droit. C'est une perspective, pas un simple
# cisaillement — il faut donc une homographie, pas une transformation affine.
#
# Le calcul tourne en C# compilé : un million de pixels de destination avec
# interpolation bilinéaire, ce serait plusieurs minutes en PowerShell pur.

Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @'
public class Homographie {
  public static byte[] Redresse(byte[] src, int sw, int sh, int stride,
      double x0, double y0, double x1, double y1,
      double x2, double y2, double x3, double y3,
      int tw, int th) {

    // Homographie du carré unité vers le quadrilatère A(0,0) B(1,0) C(1,1) D(0,1).
    double dx1 = x1 - x2, dx2 = x3 - x2, sx = x0 - x1 + x2 - x3;
    double dy1 = y1 - y2, dy2 = y3 - y2, sy = y0 - y1 + y2 - y3;
    double den = dx1 * dy2 - dx2 * dy1;
    double g = (sx * dy2 - dx2 * sy) / den;
    double h = (dx1 * sy - sx * dy1) / den;
    double a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0;
    double d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;

    byte[] dst = new byte[tw * th * 4];
    for (int v = 0; v < th; v++) {
      double t = (double)v / (th - 1);
      for (int u = 0; u < tw; u++) {
        double s = (double)u / (tw - 1);
        double w = g * s + h * t + 1.0;
        double xs = (a * s + b * t + c) / w;
        double ys = (d * s + e * t + f) / w;

        int xi = (int)xs, yi = (int)ys;
        if (xi < 0) { xi = 0; }
        if (yi < 0) { yi = 0; }
        if (xi > sw - 2) { xi = sw - 2; }
        if (yi > sh - 2) { yi = sh - 2; }
        double fx = xs - xi, fy = ys - yi;

        int i00 = yi * stride + xi * 4, i10 = i00 + 4;
        int i01 = i00 + stride, i11 = i01 + 4;
        int o = (v * tw + u) * 4;
        for (int k = 0; k < 3; k++) {
          double p = src[i00 + k] * (1 - fx) * (1 - fy) + src[i10 + k] * fx * (1 - fy)
                   + src[i01 + k] * (1 - fx) * fy       + src[i11 + k] * fx * fy;
          dst[o + k] = (byte)(p + 0.5);
        }
        dst[o + 3] = 255;
      }
    }
    return dst;
  }
}
'@ -ReferencedAssemblies System.Drawing

$img = [System.Drawing.Bitmap]::FromFile("$env:USERPROFILE\Downloads\booster_2.png")
$rect = New-Object System.Drawing.Rectangle(0, 0, $img.Width, $img.Height)
$data = $img.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$len = $data.Stride * $img.Height
$src = New-Object byte[] $len
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $src, 0, $len)
$stride = $data.Stride
$img.UnlockBits($data)

# Coins mesurés, rentrés de quelques pixels pour ne pas ramasser le halo blanc.
$tw = 760; $th = 1348
$out = [Homographie]::Redresse($src, $img.Width, $img.Height, $stride,
  455, 264, 1303, 318, 1303, 2212, 455, 2221, $tw, $th)

$bmp = New-Object System.Drawing.Bitmap($tw, $th, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$bd = $bmp.LockBits((New-Object System.Drawing.Rectangle(0, 0, $tw, $th)),
  [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
for ($y = 0; $y -lt $th; $y++) {
  [System.Runtime.InteropServices.Marshal]::Copy($out, $y * $tw * 4, [IntPtr]::Add($bd.Scan0, $y * $bd.Stride), $tw * 4)
}
$bmp.UnlockBits($bd)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
$ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]90)
$dest = 'c:\Users\Administrator\Desktop\winter-ligue\public\boosters\blizzard.jpg'
$bmp.Save($dest, $codec, $ep)
$bmp.Dispose(); $img.Dispose()

$ko = [math]::Round((Get-Item $dest).Length / 1KB)
"ecrit : $dest  ->  $tw x $th  ($ko Ko)"
