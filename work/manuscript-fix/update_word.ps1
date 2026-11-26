$ErrorActionPreference = 'Stop'
$base = 'C:\Users\ADMIN\OneDrive\Documents\Siteline\10BuildersSiteline'
$manifest = Get-Content -LiteralPath ($base+'\work\manuscript-fix\index-manifest.json') -Raw | ConvertFrom-Json
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null
try {
 $doc = $word.Documents.Open(($base+'\output\Manuscript Corrected.docx'),$false,$false)
 for ($pass=1;$pass -le 3;$pass++) {
  $doc.Repaginate()
  $null=$doc.Fields.Update()
  Write-Output ('Updated index fields pass '+$pass)
 }
 $doc.Repaginate()
 $rows=@()
 foreach ($item in $manifest) {
  $r=$doc.Bookmarks.Item($item.bookmark).Range
  $rows += [pscustomobject]@{kind=$item.kind;number=$item.number;text=$item.text;bookmark=$item.bookmark;physicalPage=$r.Information(3);pageNumber=$r.Information(1)}
 }
 $rows | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath ($base+'\work\manuscript-fix\final-page-map.json') -Encoding utf8
 $fields=@()
 foreach ($f in $doc.Fields) {
  if ($f.Code.Text -match 'PAGEREF (Index\w+)') {$fields += [pscustomobject]@{bookmark=$Matches[1];value=$f.Result.Text.Trim()}}
 }
 $fields | ConvertTo-Json | Set-Content -LiteralPath ($base+'\work\manuscript-fix\final-field-values.json') -Encoding utf8
 $guide=@()
 for ($i=1;$i -le 39;$i++) {
  $prefix='Guide'+$i.ToString('00')
  $s=$doc.Bookmarks.Item(($prefix+'Start')).Range
  $e=$doc.Bookmarks.Item(($prefix+'End')).Range
  $guide += [pscustomobject]@{topic=$i;startPage=$s.Information(3);endPage=$e.Information(3)}
 }
 $guide | ConvertTo-Json | Set-Content -LiteralPath ($base+'\work\manuscript-fix\final-guide-pages.json') -Encoding utf8
 $doc.Save()
 Write-Output ('Manuscript pages: '+$doc.ComputeStatistics(2))
 Write-Output ('Guide spillovers: '+(($guide | Where-Object {$_.startPage -ne $_.endPage}).Count))
 $doc.ExportAsFixedFormat(($base+'\work\manuscript-fix\final-manuscript.pdf'),17)
 $doc.Close(0);$doc=$null
 $doc=$word.Documents.Open(($base+'\output\10BuildLine Guide Letter Size.docx'),$false,$true)
 $doc.Repaginate()
 Write-Output ('Standalone guide pages: '+$doc.ComputeStatistics(2))
 $doc.ExportAsFixedFormat(($base+'\work\manuscript-fix\final-guide.pdf'),17)
} finally {
 if ($doc) {$doc.Close(0)}
 if ($word) {$word.Quit()}
}
