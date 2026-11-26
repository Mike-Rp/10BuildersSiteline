$ErrorActionPreference = 'Stop'
$base = 'C:\Users\ADMIN\OneDrive\Documents\Siteline\10BuildersSiteline'
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null
try {
 $doc = $word.Documents.Open(($base + '\output\Manuscript Corrected.docx'), $false, $true)
 $doc.Repaginate()
 $items = @()
 for ($i=1; $i -le 39; $i++) {
  $prefix = 'Guide' + $i.ToString('00')
  $s = $doc.Bookmarks.Item(($prefix+'Start')).Range
  $e = $doc.Bookmarks.Item(($prefix+'End')).Range
  $items += [pscustomobject]@{topic=$i;startPage=$s.Information(3);endPage=$e.Information(3);startNumber=$s.Information(1);endNumber=$e.Information(1);start=$s.Start;end=$e.End}
 }
 $items | ConvertTo-Json | Set-Content -LiteralPath ($base+'\work\manuscript-fix\guide-pages.json') -Encoding utf8
 Write-Output ('Total pages: '+$doc.ComputeStatistics(2))
 Write-Output ('Guide spillovers: '+(($items | Where-Object {$_.startPage -ne $_.endPage}).Count))
 $doc.ExportAsFixedFormat(($base+'\work\manuscript-fix\guide.pdf'),17,$false,0,3,$items[0].startPage,$items[-1].endPage)
} finally {
 if ($doc) {$doc.Close(0)}
 if ($word) {$word.Quit()}
}
