param([Parameter(Mandatory=$true)][string]$InputPath,[Parameter(Mandatory=$true)][string]$OutputPath)
$ErrorActionPreference='Stop'
$source=(Resolve-Path -LiteralPath $InputPath).Path
$target=[System.IO.Path]::GetFullPath($OutputPath)
[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null
$word=$null
$document=$null
try {
    $word=New-Object -ComObject Word.Application
    $word.Visible=$false
    $word.DisplayAlerts=0
    $document=$word.Documents.Open($source,$false,$true)
    $document.Fields.Update() | Out-Null
    $document.Repaginate()
    $pages=$document.ComputeStatistics(2)
    $document.ExportAsFixedFormat($target,17)
    [pscustomobject]@{Pages=$pages;PDF=$target} | ConvertTo-Json -Compress
} finally {
    if($null -ne $document){$document.Close(0);[System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null}
    if($null -ne $word){$word.Quit();[System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null}
}
