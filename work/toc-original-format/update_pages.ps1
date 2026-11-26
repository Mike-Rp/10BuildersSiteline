$ErrorActionPreference='Stop'
$base='C:\Users\ADMIN\OneDrive\Documents\Siteline\10BuildersSiteline'
$manifest=Get-Content -LiteralPath ($base+'\work\toc-original-format\index-manifest.json') -Raw | ConvertFrom-Json
$word=New-Object -ComObject Word.Application
$word.Visible=$false
$word.DisplayAlerts=0
$doc=$null
try {
 $doc=$word.Documents.Open(($base+'\output\Manuscript Original TOC Format.docx'),$false,$false)
 for ($i=1;$i -le 3;$i++) {$doc.Repaginate();$null=$doc.Fields.Update()}
 $doc.Repaginate()
 $rows=@()
 foreach ($item in $manifest) {
  $r=$doc.Bookmarks.Item($item.bookmark).Range
  $rows += [pscustomobject]@{kind=$item.kind;text=$item.text;bookmark=$item.bookmark;physicalPage=$r.Information(3);pageNumber=$r.Information(1)}
 }
 $rows | ConvertTo-Json | Set-Content -LiteralPath ($base+'\work\toc-original-format\page-map.json') -Encoding utf8
 $fields=@()
 foreach ($f in $doc.Fields) {
  if ($f.Code.Text -match 'PAGEREF (Index\w+)') {$fields += [pscustomobject]@{bookmark=$Matches[1];value=$f.Result.Text.Trim()}}
 }
 $fields | ConvertTo-Json | Set-Content -LiteralPath ($base+'\work\toc-original-format\field-values.json') -Encoding utf8
 $guide=@()
 for ($i=1;$i -le 39;$i++) {
  $prefix='Guide'+$i.ToString('00')
  $guide += [pscustomobject]@{topic=$i;startPage=$doc.Bookmarks.Item(($prefix+'Start')).Range.Information(3);endPage=$doc.Bookmarks.Item(($prefix+'End')).Range.Information(3)}
 }
 $guide | ConvertTo-Json | Set-Content -LiteralPath ($base+'\work\toc-original-format\guide-pages.json') -Encoding utf8
 $doc.Save()
 Write-Output ('Total pages: '+$doc.ComputeStatistics(2))
 Write-Output ('Guide spillovers: '+(($guide | Where-Object {$_.startPage -ne $_.endPage}).Count))
 $doc.ExportAsFixedFormat(($base+'\work\toc-original-format\review.pdf'),17)
} finally {
 if ($doc) {$doc.Close(0)}
 if ($word) {$word.Quit()}
}
