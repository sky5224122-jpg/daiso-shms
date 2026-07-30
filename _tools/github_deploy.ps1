<#
============================================================
 github_deploy.ps1 — GitHub 연결 및 배포 스크립트
------------------------------------------------------------
 처음 연결할 때 (저장소를 github.com 에서 먼저 만들어 두어야 합니다)
   powershell -NoProfile -ExecutionPolicy Bypass -File "_tools\github_deploy.ps1" `
     -RepoUrl "https://github.com/sky5224122-jpg/daiso-shms.git" -Message "초기 배포"

 이후 변경사항 배포
   powershell -NoProfile -ExecutionPolicy Bypass -File "_tools\github_deploy.ps1" -Message "수정 내용"

 검사만 하고 푸시하지 않기
   powershell -NoProfile -ExecutionPolicy Bypass -File "_tools\github_deploy.ps1" -CheckOnly
============================================================
#>

param(
  [string]$RepoUrl = "",
  [string]$Message = "",
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root

function Info($m){ Write-Host "  $m" }
function Ok($m){   Write-Host "  [OK] $m"   -ForegroundColor Green }
function Fail($m){ Write-Host "  [실패] $m" -ForegroundColor Red }
function Warn($m){ Write-Host "  [확인] $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "=== 안전보건관리체계 이행 관리 시스템 · GitHub 배포 ===" -ForegroundColor Cyan
Write-Host ""

# ── 1. 자바스크립트 문법 검사 ──────────────────────────────
Write-Host "--- 1. 자바스크립트 문법 검사 ---"
$jsFiles = @("js\app.js","js\core.js","js\views-core.js","js\views-ext.js","js\data\frameworks.js","config.js")
$hasError = $false
foreach($f in $jsFiles){
  if(-not (Test-Path $f)){ Fail "$f 파일이 없습니다"; $hasError = $true; continue }
  node --check $f 2>&1 | Out-Null
  if($LASTEXITCODE -eq 0){ Ok $f } else { Fail "$f 문법 오류"; $hasError = $true }
}
if($hasError){ Write-Host ""; Fail "문법 오류가 있어 배포를 중단합니다."; exit 1 }

# ── 2. 운영 키 노출 점검 ───────────────────────────────────
Write-Host ""
Write-Host "--- 2. 키 노출 점검 ---"
if(Test-Path "config.js"){
  $cfg = Get-Content "config.js" -Raw
  # 주석이 아니라 실제 anonKey 값만 검사한다
  $m = [regex]::Match($cfg, "anonKey:\s*'([^']+)'")
  if(-not $m.Success){
    Warn "config.js 에서 anonKey 값을 찾지 못했습니다"
  } elseif($m.Groups[1].Value -match "YOUR-ANON"){
    Warn "config.js 가 플레이스홀더 상태입니다 (앱 [설정] 화면에서 직접 입력하는 방식)"
  } else {
    $keyVal = $m.Groups[1].Value
    $role = ""
    try {
      $seg = $keyVal.Split('.')[1].Replace('-','+').Replace('_','/')
      while($seg.Length % 4){ $seg += '=' }
      $role = (ConvertFrom-Json ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($seg)))).role
    } catch { }
    if($role -eq "service_role"){ Fail "config.js 의 키가 service_role 입니다. 배포를 중단합니다."; exit 1 }
    if($role -eq "anon"){ Ok "config.js 에 anon public 키가 설정되어 있습니다" }
    else { Warn "config.js 키의 role 을 확인하지 못했습니다 (role=$role). anon 키인지 직접 확인하십시오." }
  }
}

if($CheckOnly){ Write-Host ""; Ok "검사만 수행했습니다. 배포하지 않았습니다."; exit 0 }

# ── 3. 원격 저장소 연결 ────────────────────────────────────
Write-Host ""
Write-Host "--- 3. 원격 저장소 ---"
$origin = (git remote get-url origin 2>$null)
if($RepoUrl){
  if($origin){ git remote set-url origin $RepoUrl } else { git remote add origin $RepoUrl }
  $origin = $RepoUrl
  Ok "origin 설정 = $origin"
} elseif($origin){
  Ok "origin = $origin"
} else {
  Fail "원격 저장소가 연결되어 있지 않습니다."
  Info ""
  Info "  1) https://github.com/new 에서 저장소를 만드십시오."
  Info "     - Repository name : daiso-shms (예시)"
  Info "     - Private 권장 (사내 안전보건 자료)"
  Info "     - README/.gitignore 는 체크하지 마십시오 (이미 있습니다)"
  Info "  2) 만든 뒤 아래처럼 다시 실행하십시오."
  Info "     -RepoUrl `"https://github.com/sky5224122-jpg/daiso-shms.git`""
  Info ""
  exit 1
}

# ── 4. 커밋 ────────────────────────────────────────────────
Write-Host ""
Write-Host "--- 4. 커밋 ---"
$changed = git status --porcelain
if($changed){
  if(-not $Message){ $Message = "변경사항 반영 $(Get-Date -Format 'yyyy-MM-dd HH:mm')" }
  git add -A
  git commit -q -m $Message
  Ok "커밋 완료 — $Message"
} else {
  Info "변경된 파일이 없습니다. 기존 커밋을 그대로 배포합니다."
}

# ── 5. 푸시 ────────────────────────────────────────────────
Write-Host ""
Write-Host "--- 5. 푸시 ---"
$branch = (git rev-parse --abbrev-ref HEAD)
if($branch -ne "main"){ git branch -M main; $branch = "main"; Ok "브랜치를 main 으로 변경" }
git push -u origin main
if($LASTEXITCODE -ne 0){ Write-Host ""; Fail "푸시 실패 — GitHub 로그인 창이 뜨면 로그인한 뒤 다시 실행하십시오."; exit 1 }
Ok "푸시 완료"

# ── 6. 안내 ────────────────────────────────────────────────
$page = $origin -replace '\.git$','' -replace 'https://github\.com/([^/]+)/(.+)','https://$1.github.io/$2/'
Write-Host ""
Write-Host "=== 다음 단계 ===" -ForegroundColor Cyan
Info "1) 저장소 → Settings → Pages → Source = 'GitHub Actions' 로 설정"
Info "2) Actions 탭에서 'Deploy to GitHub Pages' 실행 결과 확인 (약 1분)"
Info "3) 배포 주소(예상): $page"
Info ""
Info "※ Private 저장소는 GitHub Pages 공개 배포에 유료 플랜이 필요할 수 있습니다."
Info "   무료 플랜이면 Public 저장소로 만들되, config.js 에 실제 키를 넣지 말고"
Info "   앱 [설정] 화면에서 각자 입력하는 방식을 사용하십시오."
Write-Host ""
