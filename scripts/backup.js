/**
 * Script de Backup e Restauração de Dados
 * Use antes de fazer pull do GitHub para não perder dados
 * 
 * Comandos:
 * node scripts/backup.js backup    - Cria backup dos dados atuais
 * node scripts/backup.js restore   - Restaura último backup
 * node scripts/backup.js list      - Lista backups disponíveis
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DATA_DIR = path.join(__dirname, '..', 'data');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Criar diretório de backup se não existir
if (!fs.existsSync(BACKUP_DIR)) {
 fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function getTimestamp() {
 const now = new Date();
 return now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function backup() {
 console.log('💾 Criando backup dos dados...\n');

 if (!fs.existsSync(DATA_DIR)) {
 console.log('❌ Pasta data/ não encontrada. Nada para backup.');
 return;
 }

 const timestamp = getTimestamp();
 const backupName = `backup_${timestamp}`;
 const backupPath = path.join(BACKUP_DIR, backupName);

 try {
 // Criar pasta do backup
 fs.mkdirSync(backupPath, { recursive: true });

 // Copiar todos os arquivos da pasta data
 const files = fs.readdirSync(DATA_DIR);

 let copiedCount = 0;
 files.forEach(file => {
 const srcPath = path.join(DATA_DIR, file);
 const destPath = path.join(backupPath, file);

 // Só copia arquivos (não subpastas para evitar recursão infinita)
 if (fs.statSync(srcPath).isFile()) {
 fs.copyFileSync(srcPath, destPath);
 console.log(`  ✅ ${file}`);
 copiedCount++;
 }
 });

 console.log(`\n✅ Backup criado: backups/${backupName}/`);
 console.log(`📁 Arquivos copiados: ${copiedCount}`);
 console.log(`\n💡 Dica: Guarde este backup em local seguro antes de fazer pull do GitHub!`);

 // Criar arquivo de info
 const info = {
 data: timestamp,
 arquivos: copiedCount,
 origem: 'Backup automático antes de atualização'
 };
 fs.writeFileSync(path.join(backupPath, '_info.json'), JSON.stringify(info, null, 2));

 } catch (error) {
 console.error('❌ Erro ao criar backup:', error);
 process.exit(1);
 }
}

function restore(backupName = null) {
 console.log('🔄 Restaurando backup...\n');

 let backupPath;

 if (backupName) {
 backupPath = path.join(BACKUP_DIR, backupName);
 } else {
 // Pegar o backup mais recente
 const backups = fs.readdirSync(BACKUP_DIR)
 .filter(f => f.startsWith('backup_'))
 .sort()
 .reverse();

 if (backups.length === 0) {
 console.log('❌ Nenhum backup encontrado!');
 return;
 }

 backupPath = path.join(BACKUP_DIR, backups[0]);
 console.log(`📁 Usando backup mais recente: ${backups[0]}\n`);
 }

 if (!fs.existsSync(backupPath)) {
 console.log(`❌ Backup não encontrado: ${backupPath}`);
 return;
 }

 // Criar pasta data se não existir
 if (!fs.existsSync(DATA_DIR)) {
 fs.mkdirSync(DATA_DIR, { recursive: true });
 }

 // Copiar arquivos do backup para data/
 const files = fs.readdirSync(backupPath);
 let restoredCount = 0;

 files.forEach(file => {
 if (file.startsWith('_')) return; // Ignora arquivos de controle

 const srcPath = path.join(backupPath, file);
 const destPath = path.join(DATA_DIR, file);

 if (fs.statSync(srcPath).isFile()) {
 fs.copyFileSync(srcPath, destPath);
 console.log(`  ✅ ${file}`);
 restoredCount++;
 }
 });

 console.log(`\n✅ Backup restaurado!`);
 console.log(`📁 Arquivos restaurados: ${restoredCount}`);
}

function list() {
 console.log('📋 Backups disponíveis:\n');

 if (!fs.existsSync(BACKUP_DIR)) {
 console.log('❌ Nenhum backup encontrado.');
 return;
 }

 const backups = fs.readdirSync(BACKUP_DIR)
 .filter(f => f.startsWith('backup_'))
 .sort()
 .reverse();

 if (backups.length === 0) {
 console.log('❌ Nenhum backup encontrado.');
 return;
 }

 backups.forEach((backup, index) => {
 const backupPath = path.join(BACKUP_DIR, backup);
 const stats = fs.statSync(backupPath);
 const size = (fs.readdirSync(backupPath).length - 1) + ' arquivos'; // -1 para ignorar _info.json
 const date = stats.mtime.toLocaleString('pt-BR');
 const marker = index === 0 ? ' 👈 MAIS RECENTE' : '';
 console.log(`  ${index + 1}. ${backup} (${size}) - ${date}${marker}`);
 });

 console.log(`\n💡 Use: node scripts/backup.js restore ${backups[0]}`);
}

// Comando principal
const command = process.argv[2];
const arg = process.argv[3];

switch (command) {
 case 'backup':
 backup();
 break;
 case 'restore':
 restore(arg);
 break;
 case 'list':
 list();
 break;
 default:
 console.log(`
🛡️  Sistema de Backup - NOTAG BOT

Uso:
  node scripts/backup.js backup           Cria backup dos dados atuais
  node scripts/backup.js restore          Restaura backup mais recente
  node scripts/backup.js restore [nome]   Restorna backup específico
  node scripts/backup.js list             Lista todos os backups

⚠️  IMPORTANTE: Sempre faça backup antes de puxar do GitHub!!
`);
}