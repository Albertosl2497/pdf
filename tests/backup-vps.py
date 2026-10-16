import subprocess, tempfile, pathlib, json, uuid, os, hashlib, shutil, stat
project='pdf-backup-check-'+uuid.uuid4().hex[:10]
work=pathlib.Path(tempfile.mkdtemp(prefix=project+'-'))
compose=work/'compose.json'; exported=work/'private-export'
compose.write_text(json.dumps({'services':{'app':{'image':'herramientas-pdf:local','environment':{'APP_ORIGIN':'https://pdf.example.test'},'volumes':['data:/data'],'read_only':True,'tmpfs':['/tmp:size=32m,mode=1777']}},'volumes':{'data':{}}}))
env={**os.environ,'COMPOSE_FILE':str(compose),'COMPOSE_PROJECT_NAME':project}
def run(*args,input=None):
 return subprocess.check_output(args,env=env,input=input,text=True).strip()
try:
 run('docker','compose','up','-d','--wait','--wait-timeout','60')
 run('docker','compose','exec','-T','app','node','scripts/owner.mjs','owner@example.test',input='contraseña sintética de copia externa 123\n')
 run('docker','compose','exec','-T','app','node','scripts/identity.mjs','Responsable sintético','México','contacto@example.test')
 print(run('sh','scripts/vps-backup.sh',str(exported)))
 copies=list(exported.glob('*.sqlite'));assert len(copies)==1
 source=copies[0];checksum=source.with_name(source.name+'.sha256').read_text().split()[0]
 assert hashlib.sha256(source.read_bytes()).hexdigest()==checksum
 assert stat.S_IMODE(exported.stat().st_mode)==0o700
 assert stat.S_IMODE(source.stat().st_mode)==0o600
 print('Exportación al host verificada: copia completa, ensayo temporal, checksum correcto y permisos privados. Solo datos sintéticos.')
finally:
 subprocess.run(['docker','compose','down','-v','--remove-orphans'],env=env,capture_output=True)
 shutil.rmtree(work,ignore_errors=True)
