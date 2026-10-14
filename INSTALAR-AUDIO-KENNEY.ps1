# Importador opcional. Baixa pacotes Kenney CC0 diretamente das paginas oficiais.
# Nao altera o jogo nem remove os arquivos de audio originais.
$ErrorActionPreference='Stop'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$cache=Join-Path $env:TEMP 'hulk-smash-city-kenney'
$dest=Join-Path $root 'assets\audio\kenney'
New-Item -ItemType Directory -Force -Path $cache,$dest | Out-Null
$packs=@(
 @{id='impact';url='https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip'},
 @{id='scifi';url='https://kenney.nl/media/pages/assets/sci-fi-sounds/6b296f9ecf-1677589334/kenney_sci-fi-sounds.zip'}
)
$available=@{}
foreach($p in $packs){
 try{
  $zip=Join-Path $cache ($p.id+'.zip')
  $dir=Join-Path $cache $p.id
  Write-Host ('Baixando '+$p.id+' de kenney.nl (CC0)...') -ForegroundColor Cyan
  Invoke-WebRequest -Uri $p.url -OutFile $zip -UseBasicParsing -TimeoutSec 60
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  $available[$p.id]=@(Get-ChildItem -LiteralPath $dir -Recurse -File -Filter '*.ogg')
  Write-Host ('Arquivos de '+$p.id+': '+$available[$p.id].Count) -ForegroundColor Green
 }catch{Write-Warning ('Falha ao obter '+$p.id+': '+$_.Exception.Message)}
}
$select=@(
 @{kind='punch';pack='impact';pattern='impactGeneric_heavy_00[0-9]\.ogg$'},
 @{kind='hit';pack='impact';pattern='impactGeneric_medium_00[0-9]\.ogg$'},
 @{kind='slam';pack='impact';pattern='impactMetal_heavy_00[0-9]\.ogg$'},
 @{kind='crash';pack='impact';pattern='impactMetal_medium_00[0-9]\.ogg$'},
 @{kind='collapse';pack='impact';pattern='impactStone_heavy_00[0-9]\.ogg$'},
 @{kind='boom';pack='scifi';pattern='explosion.*\.ogg$'},
 @{kind='laser';pack='scifi';pattern='laser.*\.ogg$'},
 @{kind='grab';pack='impact';pattern='impactMetal_light_00[0-9]\.ogg$'}
)
$map=@{}
foreach($entry in $select){
 $options=@($available[$entry.pack] | Where-Object { $_.Name -match $entry.pattern })
 if($options.Count -eq 0){Write-Host ('Sem substituto para '+$entry.kind+' - usando o OGG original.');continue}
 $source=$options[0]
 $outName=('kenney_'+$entry.kind+'.ogg')
 Copy-Item -LiteralPath $source.FullName -Destination (Join-Path $dest $outName) -Force
 $map[$entry.kind]='assets/audio/kenney/'+$outName
 Write-Host ('Importado '+$entry.kind+': '+$source.Name) -ForegroundColor Green
}
$map | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 -Path (Join-Path $root 'assets\audio\kenney-map.json')
Write-Host ('Concluido: '+$map.Count+' sons CC0 ativados. Reinicie o jogo.') -ForegroundColor Green
Write-Host 'Credito opcional: Kenney.nl - CC0 1.0.'
