Add-Type -AssemblyName System.Drawing

$out = Join-Path $PSScriptRoot '..\assets\app-icon.png'
$icoOut = Join-Path $PSScriptRoot '..\assets\app-icon.ico'
$bitmap = [System.Drawing.Bitmap]::new(512, 512, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.ScaleTransform(0.5, 0.5)
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255, 32, 37, 38), 52)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
function Stroke([System.Drawing.Drawing2D.GraphicsPath]$path) { $graphics.DrawPath($pen, $path); $path.Dispose() }
function Path { [System.Drawing.Drawing2D.GraphicsPath]::new() }
function Oval([float]$x, [float]$y, [float]$radiusX, [float]$radiusY, [float]$angle) {
  $state = $graphics.Save()
  $graphics.TranslateTransform($x, $y)
  $graphics.RotateTransform($angle)
  $graphics.DrawEllipse($pen, -$radiusX, -$radiusY, $radiusX * 2, $radiusY * 2)
  $graphics.Restore($state)
}

$p = Path; $p.AddBezier(402,460,430,338,532,260,664,260); $p.AddBezier(664,260,841,260,984,403,984,580); $p.AddBezier(984,580,984,757,841,900,664,900); $p.AddBezier(664,900,588,900,518,873,463,828); Stroke $p
$p = Path; $p.AddLine(623,260,623,181); Stroke $p
$p = Path; $p.AddBezier(574,82,574,53,597,30,626,30); $p.AddLine(705,30); $p.AddBezier(705,30,759,30,801,57,828,106); $p.AddLine(904,249); Stroke $p
$p = Path; $p.AddLine(574,181,700,181); Stroke $p
$p = Path; $p.AddLine(665,570,781,470); Stroke $p
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 32, 37, 38)); $graphics.FillEllipse($brush, 598,585,52,52); $brush.Dispose()
Oval 332 496 119 71 35
Oval 330 634 121 71 35
Oval 358 766 105 62 35
$graphics.ResetTransform(); $pen.Dispose(); $graphics.Dispose()
$bitmap.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)

# Write standard multi-resolution PNG layers for the Windows ICO resource.
function New-PngIconLayer {
  param([int]$sizePx)
  $layer = [System.Drawing.Bitmap]::new($sizePx, $sizePx, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $layerGraphics = [System.Drawing.Graphics]::FromImage($layer)
  $layerGraphics.Clear([System.Drawing.Color]::Transparent)
  $layerGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $layerGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $layerGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $layerGraphics.DrawImage($bitmap, [System.Drawing.Rectangle]::new(0, 0, $sizePx, $sizePx), 0, 0, 512, 512, [System.Drawing.GraphicsUnit]::Pixel)
  $stream = [System.IO.MemoryStream]::new()
  $layer.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $layerGraphics.Dispose(); $layer.Dispose()
  $bytes = $stream.ToArray(); $stream.Dispose()
  Write-Output -NoEnumerate $bytes
}
$iconSizes = 16, 32, 48, 256
$iconLayers = @($iconSizes | ForEach-Object { New-PngIconLayer $_ })
$icoStream = [System.IO.File]::Open($icoOut, [System.IO.FileMode]::Create)
$writer = [System.IO.BinaryWriter]::new($icoStream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$iconLayers.Count)
$offset = 6 + (16 * $iconLayers.Count)
for ($index = 0; $index -lt $iconLayers.Count; $index++) {
  $iconSize = $iconSizes[$index]
  $writer.Write([byte]$(if ($iconSize -eq 256) { 0 } else { $iconSize }))
  $writer.Write([byte]$(if ($iconSize -eq 256) { 0 } else { $iconSize }))
  $writer.Write([byte]0); $writer.Write([byte]0)
  $writer.Write([uint16]1); $writer.Write([uint16]32)
  $writer.Write([uint32]$iconLayers[$index].Length); $writer.Write([uint32]$offset)
  $offset += $iconLayers[$index].Length
}
foreach ($layer in $iconLayers) { $writer.Write($layer) }
$writer.Dispose(); $icoStream.Dispose()
$bitmap.Dispose()
