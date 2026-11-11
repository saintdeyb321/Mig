param([ValidateSet('preview', 'final')][string]$Mode = 'preview')

Add-Type -AssemblyName System.Drawing
$review = Join-Path $PSScriptRoot 'review'
$source = if ($Mode -eq 'preview') { Join-Path $PSScriptRoot '.cache/preview-review' } else { $review }
$files = @(Get-ChildItem -LiteralPath $source -File | Where-Object Name -Match '^\d\d-.+-[123]\.png$' | Sort-Object Name)
if ($files.Count -ne 36) { throw "Se esperaban 36 fotogramas en $source y se encontraron $($files.Count)." }
New-Item -ItemType Directory -Path $review -Force | Out-Null
$width = 246
$height = 438
$pen = [Drawing.Pen]::new([Drawing.Color]::FromArgb(165, 201, 174, 251), 1)
$pen.DashStyle = 'Dash'
try {
    for ($page = 0; $page -lt 3; $page++) {
        $bitmap = [Drawing.Bitmap]::new(3 * $width, 4 * $height)
        $drawing = [Drawing.Graphics]::FromImage($bitmap)
        $drawing.InterpolationMode = 'HighQualityBicubic'
        try {
            for ($index = 0; $index -lt 12; $index++) {
                $image = [Drawing.Image]::FromFile($files[$page * 12 + $index].FullName)
                try {
                    $x = ($index % 3) * $width
                    $y = [math]::Floor($index / 3) * $height
                    $drawing.DrawImage($image, $x, $y, $width, $height)
                    $drawing.DrawRectangle($pen, ($x + 18), ($y + 21), 190, 337)
                } finally { $image.Dispose() }
            }
            $file = Join-Path $review ("{0}-tira-{1}.png" -f $Mode, ($page + 1))
            $bitmap.Save($file, [Drawing.Imaging.ImageFormat]::Png)
            Write-Output $file
        } finally { $drawing.Dispose(); $bitmap.Dispose() }
    }
} finally { $pen.Dispose() }
