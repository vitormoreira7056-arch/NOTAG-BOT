const {
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 ChannelType,
 PermissionFlagsBits
} = require('discord.js');
const https = require('https');
const AlbionAPI = require('./albionApi');

/**
 * Sistema de Killboard - Monitora kills e deaths da guilda
 * Features:
 * - Polling automático com backoff exponencial (30s -> 60s -> 120s -> 240s -> 480s)
 * - Detecção de guilda inválida (para após 5 falhas ou guilda não existente)
 * - Imagens de equipamentos via render.albiononline.com
 * - Cálculo de valores via Albion Data Project
 * - Cache anti-duplicados
 * - Canais separados para kills e deaths
 */
class KillboardHandler {
 constructor() {
 this.pollingIntervals = new Map(); // guildId -> interval
 this.lastEventIds = new Map(); // guildId -> Set(eventIds)
 this.processedEvents = new Map(); // guildId -> Map(eventId -> timestamp)
 this.maxCacheSize = 1000; // Manter últimos 1000 eventos em cache

 // ✅ NOVO: Estatísticas de polling para backoff e controle de falhas
 this.pollingStats = new Map(); // guildId -> { consecutiveFailures, lastFailureTime, currentInterval, isPaused, invalidGuildDetected }

 // ✅ CONSTANTES DE CONFIGURAÇÃO
 this.config = {
 baseInterval: 30000,        // 30 segundos base
 maxInterval: 300000,        // 5 minutos máximo
 maxConsecutiveFailures: 5,  // Parar após 5 falhas
 failureThreshold: 3,        // Verificar se guilda existe após 3 falhas
 backoffMultiplier: 2        // Multiplicador de backoff
 };
 }

 /**
 * Inicializa o sistema de killboard para uma guilda
 */
 async initialize(guild, config = {}) {
 try {
 const guildId = guild.id;

 // Configurações padrão
 const killboardConfig = {
 enabled: true,
 killChannelId: null,
 deathChannelId: null,
 guildIdAlbion: null, // ID da guilda no Albion Online
 allianceId: null, // ID da aliança (opcional)
 trackKills: true,
 trackDeaths: true,
 minFame: 0, // Fama mínima para notificar
 showInventory: true,
 showGear: true,
 language: 'pt',
 ...config
 };

 // Criar canais se não existirem
 if (!killboardConfig.killChannelId) {
 const killChannel = await this.createKillChannel(guild);
 killboardConfig.killChannelId = killChannel.id;
 }

 if (!killboardConfig.deathChannelId) {
 const deathChannel = await this.createDeathChannel(guild);
 killboardConfig.deathChannelId = deathChannel.id;
 }

 // Salvar configuração
 if (!global.guildConfig) global.guildConfig = new Map();
 const currentConfig = global.guildConfig.get(guildId) || {};
 global.guildConfig.set(guildId, {
 ...currentConfig,
 killboard: killboardConfig
 });

 // ✅ VERIFICAÇÃO CRÍTICA: Validar se guilda existe antes de iniciar polling
 if (killboardConfig.guildIdAlbion) {
 const guildValid = await this.validateGuildExists(killboardConfig.guildIdAlbion);
 if (!guildValid) {
 console.error(`[Killboard] ❌ Guilda Albion ${killboardConfig.guildIdAlbion} não existe! Polling não iniciado.`);
 // Notificar admin via canal de logs se disponível
 await this.notifyInvalidGuild(guild, killboardConfig.guildIdAlbion);
 return killboardConfig;
 }

 // Iniciar polling com intervalo base
 this.startPolling(guildId, killboardConfig);
 }

 console.log(`[Killboard] ✅ Inicializado para guild ${guildId}`);
 return killboardConfig;
 } catch (error) {
 console.error('[Killboard] ❌ Erro na inicialização:', error);
 throw error;
 }
 }

 /**
 * ✅ NOVO: Valida se a guilda existe na API do Albion
 */
 async validateGuildExists(albionGuildId) {
 try {
 console.log(`[Killboard] 🔍 Validando existência da guilda ${albionGuildId}...`);
 const guildInfo = await AlbionAPI.getGuildInfo(albionGuildId);
 return guildInfo !== null && guildInfo.Id === albionGuildId;
 } catch (error) {
 console.error(`[Killboard] ❌ Erro ao validar guilda:`, error);
 return false;
 }
 }

 /**
 * ✅ NOVO: Notifica admins sobre guilda inválida
 */
 async notifyInvalidGuild(guild, invalidGuildId) {
 try {
 const adminRole = guild.roles.cache.find(r => r.name === 'ADM');
 const staffRole = guild.roles.cache.find(r => r.name === 'Staff');
 const logChannel = guild.channels.cache.find(c => c.name === '📜╠logs-sistema');

 const embed = new EmbedBuilder()
 .setTitle('⚠️ Killboard - Guilda Inválida')
 .setDescription(
 `**Não foi possível iniciar o monitoramento!**\n\n` +
 `A guilda Albion configurada (**\`${invalidGuildId}\`**) não foi encontrada na API.\n\n` +
 `**Solução:** Use \`/killboard config [guildIdCorreto]\` para configurar um ID válido.`
 )
 .setColor(0xE74C3C)
 .setTimestamp();

 const mentions = [];
 if (adminRole) mentions.push(`<@&${adminRole.id}>`);
 if (staffRole) mentions.push(`<@&${staffRole.id}>`);

 const content = mentions.length > 0 ? mentions.join(' ') : '@everyone';

 if (logChannel) {
 await logChannel.send({ content, embeds: [embed] });
 } else {
 // Tentar enviar no primeiro canal de texto disponível
 const firstChannel = guild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));
 if (firstChannel) {
 await firstChannel.send({ content, embeds: [embed] });
 }
 }
 } catch (error) {
 console.error(`[Killboard] ❌ Erro ao notificar guilda inválida:`, error);
 }
 }

 /**
 * Cria canal de kills
 */
 async createKillChannel(guild) {
 try {
 const channel = await guild.channels.create({
 name: '💀-kill-feed',
 type: ChannelType.GuildText,
 topic: '💀 Kills da Guilda - Monitoramento automático',
 permissionOverwrites: [
 {
 id: guild.id,
 allow: [PermissionFlagsBits.ViewChannel],
 deny: [PermissionFlagsBits.SendMessages]
 }
 ]
 });
 console.log(`[Killboard] ✅ Canal de kills criado: ${channel.id}`);
 return channel;
 } catch (error) {
 console.error('[Killboard] ❌ Erro ao criar canal de kills:', error);
 throw error;
 }
 }

 /**
 * Cria canal de deaths
 */
 async createDeathChannel(guild) {
 try {
 const channel = await guild.channels.create({
 name: '☠️-death-feed',
 type: ChannelType.GuildText,
 topic: '☠️ Mortes da Guilda - Monitoramento automático',
 permissionOverwrites: [
 {
 id: guild.id,
 allow: [PermissionFlagsBits.ViewChannel],
 deny: [PermissionFlagsBits.SendMessages]
 }
 ]
 });
 console.log(`[Killboard] ✅ Canal de deaths criado: ${channel.id}`);
 return channel;
 } catch (error) {
 console.error('[Killboard] ❌ Erro ao criar canal de deaths:', error);
 throw error;
 }
 }

 /**
 * Configura o ID da guilda do Albion
 */
 async setGuildId(guildId, albionGuildId) {
 try {
 // ✅ VALIDAÇÃO: Verificar se guilda existe antes de configurar
 const guildValid = await this.validateGuildExists(albionGuildId);
 if (!guildValid) {
 throw new Error(`Guilda Albion ${albionGuildId} não existe na API`);
 }

 const config = global.guildConfig?.get(guildId)?.killboard || {};
 config.guildIdAlbion = albionGuildId;

 // Buscar dados da guilda para confirmar
 const guildData = await AlbionAPI.getGuildInfo(albionGuildId);
 if (guildData) {
 config.allianceId = guildData.AllianceId;
 }

 // Atualizar config
 const currentConfig = global.guildConfig.get(guildId) || {};
 global.guildConfig.set(guildId, {
 ...currentConfig,
 killboard: config
 });

 // ✅ REINICIAR POLLING com estatísticas limpas
 this.stopPolling(guildId);
 this.resetPollingStats(guildId);
 this.startPolling(guildId, config);

 return guildData;
 } catch (error) {
 console.error('[Killboard] ❌ Erro ao configurar guilda:', error);
 throw error;
 }
 }

 /**
 * ✅ NOVO: Reseta estatísticas de polling
 */
 resetPollingStats(guildId) {
 this.pollingStats.set(guildId, {
 consecutiveFailures: 0,
 lastFailureTime: null,
 currentInterval: this.config.baseInterval,
 isPaused: false,
 invalidGuildDetected: false,
 lastSuccessTime: null,
 totalRequests: 0
 });
 }

 /**
 * ✅ MELHORADO: Inicia o polling com intervalo dinâmico (backoff)
 */
 startPolling(guildId, config) {
 // Limpar intervalo anterior se existir
 this.stopPolling(guildId);

 // Inicializar estatísticas se não existirem
 if (!this.pollingStats.has(guildId)) {
 this.resetPollingStats(guildId);
 }

 const stats = this.pollingStats.get(guildId);
 if (stats.isPaused || stats.invalidGuildDetected) {
 console.log(`[Killboard] ⏸️ Polling pausado ou guilda inválida para ${guildId}`);
 return;
 }

 console.log(`[Killboard] ▶️ Iniciando polling para guild ${guildId} (intervalo: ${stats.currentInterval}ms)`);

 // Primeira execução imediata
 this.checkNewEvents(guildId, config);

 // Configurar intervalo dinâmico
 const intervalId = setInterval(() => {
 const currentStats = this.pollingStats.get(guildId);
 if (!currentStats || currentStats.isPaused || currentStats.invalidGuildDetected) {
 return;
 }
 this.checkNewEvents(guildId, config);
 }, stats.currentInterval);

 this.pollingIntervals.set(guildId, intervalId);
 }

 /**
 * Para o polling
 */
 stopPolling(guildId) {
 if (this.pollingIntervals.has(guildId)) {
 clearInterval(this.pollingIntervals.get(guildId));
 this.pollingIntervals.delete(guildId);
 console.log(`[Killboard] ⏹️ Polling parado para guild ${guildId}`);
 }
 }

 /**
 * ✅ MELHORADO: Para polling com erro específico
 */
 stopPollingWithError(guildId, reason) {
 this.stopPolling(guildId);
 const stats = this.pollingStats.get(guildId);
 if (stats) {
 stats.isPaused = true;
 stats.invalidGuildDetected = reason.includes('inválida') || reason.includes('não existe');
 }
 console.error(`[Killboard] 🛑 Polling parado para guild ${guildId}: ${reason}`);
 }

 /**
 * ✅ MELHORADO: Atualiza intervalo com backoff exponencial
 */
 updatePollingInterval(guildId, success) {
 const stats = this.pollingStats.get(guildId);
 if (!stats) return;

 if (success) {
 // ✅ Sucesso: Resetar para intervalo base
 if (stats.consecutiveFailures > 0) {
 console.log(`[Killboard] ✅ Sucesso! Resetando intervalo para ${this.config.baseInterval}ms`);
 stats.consecutiveFailures = 0;
 stats.currentInterval = this.config.baseInterval;
 stats.lastSuccessTime = Date.now();
 // Reiniciar polling com novo intervalo
 const config = global.guildConfig?.get(guildId)?.killboard;
 if (config) {
 this.startPolling(guildId, config);
 }
 }
 } else {
 // ❌ Falha: Aumentar contador e aplicar backoff
 stats.consecutiveFailures++;
 stats.lastFailureTime = Date.now();
 stats.totalRequests++;

 // Calcular novo intervalo com backoff exponencial
 const newInterval = Math.min(
 this.config.baseInterval * Math.pow(this.config.backoffMultiplier, stats.consecutiveFailures),
 this.config.maxInterval
 );

 stats.currentInterval = newInterval;
 console.warn(`[Killboard] ⚠️ Falha ${stats.consecutiveFailures}/${this.config.maxConsecutiveFailures}. Novo intervalo: ${newInterval}ms`);

 // Verificar se atingiu limite de falhas
 if (stats.consecutiveFailures >= this.config.maxConsecutiveFailures) {
 this.stopPollingWithError(guildId, `Máximo de ${this.config.maxConsecutiveFailures} falhas consecutivas atingido`);

 // Notificar admins
 this.notifyPollingFailure(guildId);
 return;
 }

 // Se atingiu threshold de verificação, checar se guilda ainda existe
 if (stats.consecutiveFailures === this.config.failureThreshold) {
 this.checkGuildStillExists(guildId);
 }

 // Reiniciar polling com novo intervalo
 const config = global.guildConfig?.get(guildId)?.killboard;
 if (config && !stats.isPaused) {
 this.startPolling(guildId, config);
 }
 }
 }

 /**
 * ✅ NOVO: Verifica se guilda ainda existe (após múltiplas falhas)
 */
 async checkGuildStillExists(guildId) {
 const config = global.guildConfig?.get(guildId)?.killboard;
 if (!config?.guildIdAlbion) return;

 console.log(`[Killboard] 🔍 Verificando se guilda ${config.guildIdAlbion} ainda existe...`);
 const exists = await this.validateGuildExists(config.guildIdAlbion);

 if (!exists) {
 console.error(`[Killboard] ❌ Guilda ${config.guildIdAlbion} não existe mais! Parando polling.`);
 this.stopPollingWithError(guildId, `Guilda Albion inválida ou não existe`);

 const client = global.client;
 const guild = client.guilds.cache.get(guildId);
 if (guild) {
 await this.notifyInvalidGuild(guild, config.guildIdAlbion);
 }
 }
 }

 /**
 * ✅ NOVO: Notifica admins sobre falha no polling
 */
 async notifyPollingFailure(guildId) {
 try {
 const client = global.client;
 const guild = client.guilds.cache.get(guildId);
 if (!guild) return;

 const logChannel = guild.channels.cache.find(c => c.name === '📜╠logs-sistema') || 
 guild.channels.cache.find(c => c.type === ChannelType.GuildText);

 if (!logChannel) return;

 const stats = this.pollingStats.get(guildId);
 const embed = new EmbedBuilder()
 .setTitle('🚨 Killboard - Falha Crítica')
 .setDescription(
 `**O sistema de killboard foi pausado após múltiplas falhas!**\n\n` +
 `**Falhas consecutivas:** ${stats?.consecutiveFailures || 'Desconhecido'}\n` +
 `**Última tentativa:** ${stats?.lastFailureTime ? new Date(stats.lastFailureTime).toLocaleString('pt-BR') : 'N/A'}\n\n` +
 `**Possíveis causas:**\n` +
 `• API do Albion indisponível\n` +
 `• ID da guilda incorreto\n` +
 `• Problemas de conectividade\n\n` +
 `**Para retomar:** Use \`/killboard restart\` ou reconfigure o sistema.`
 )
 .setColor(0xE74C3C)
 .setTimestamp();

 await logChannel.send({ embeds: [embed] });
 } catch (error) {
 console.error(`[Killboard] ❌ Erro ao notificar falha:`, error);
 }
 }

 /**
 * ✅ MELHORADO: Verifica novos eventos na API com tratamento de erro aprimorado
 */
 async checkNewEvents(guildId, config) {
 try {
 if (!config.guildIdAlbion) return;

 const client = global.client;
 const guild = client.guilds.cache.get(guildId);
 if (!guild) {
 console.warn(`[Killboard] ⚠️ Guild ${guildId} não encontrada no cache`);
 this.updatePollingInterval(guildId, false);
 return;
 }

 // ✅ Incrementar contador de requests
 const stats = this.pollingStats.get(guildId);
 if (stats) {
 stats.totalRequests++;
 }

 // Buscar últimos eventos da guilda
 const events = await this.fetchGuildEvents(config.guildIdAlbion, 50);

 // ✅ Se retornou null (erro crítico) em vez de [] (vazio normal)
 if (events === null) {
 console.warn(`[Killboard] ⚠️ fetchGuildEvents retornou null para guild ${guildId}`);
 this.updatePollingInterval(guildId, false);
 return;
 }

 // ✅ Sucesso na requisição (mesmo que vazio)
 this.updatePollingInterval(guildId, true);

 if (!events || events.length === 0) return;

 // Inicializar cache se necessário
 if (!this.processedEvents.has(guildId)) {
 this.processedEvents.set(guildId, new Map());
 }
 const guildCache = this.processedEvents.get(guildId);

 // Processar cada evento
 let processedCount = 0;
 for (const event of events) {
 // Verificar se já processamos este evento (últimas 24h)
 if (guildCache.has(event.EventId)) continue;

 // Adicionar ao cache
 guildCache.set(event.EventId, Date.now());
 processedCount++;

 // Limpar cache antigo (manter apenas últimos 1000)
 if (guildCache.size > this.maxCacheSize) {
 const oldestKey = guildCache.keys().next().value;
 guildCache.delete(oldestKey);
 }

 // Verificar se é kill ou death da nossa guilda
 const isOurGuildKill = event.Killer?.GuildId === config.guildIdAlbion;
 const isOurGuildDeath = event.Victim?.GuildId === config.guildIdAlbion;

 // Se for kill da nossa guilda e estiver habilitado
 if (isOurGuildKill && config.trackKills) {
 await this.processKill(guild, event, config);
 }

 // Se for death da nossa guilda e estiver habilitado
 if (isOurGuildDeath && config.trackDeaths) {
 await this.processDeath(guild, event, config);
 }
 }

 if (processedCount > 0) {
 console.log(`[Killboard] ✅ ${processedCount} novos eventos processados para guild ${guildId}`);
 }

 } catch (error) {
 console.error(`[Killboard] ❌ Erro no polling da guild ${guildId}:`, error);
 this.updatePollingInterval(guildId, false);
 }
 }

 /**
 * ✅ MELHORADO: Busca eventos da guilda com melhor tratamento de erro
 * Retorna: Array de eventos, [] se vazio, ou null se erro crítico
 */
 async fetchGuildEvents(guildId, limit = 50) {
 const maxAttempts = 3;
 const timeout = 30000;

 // Endpoints para fallback (Europa, Américas, Ásia)
 const endpoints = [
 'gameinfo.albiononline.com',
 'gameinfo-ams.albiononline.com',
 'gameinfo-sgp.albiononline.com'
 ];

 let lastError = null;
 let emptyResponses = 0;

 for (const endpoint of endpoints) {
 for (let attempt = 1; attempt <= maxAttempts; attempt++) {
 try {
 console.log(`[Killboard] 🌐 Buscando eventos em ${endpoint} (tentativa ${attempt}/${maxAttempts})`);

 const result = await new Promise((resolve, reject) => {
 const options = {
 hostname: endpoint,
 path: `/api/gameinfo/events?guildId=${guildId}&limit=${limit}&offset=0`,
 method: 'GET',
 headers: {
 'Accept': 'application/json',
 'User-Agent': 'Mozilla/5.0'
 },
 timeout: timeout
 };

 const req = https.request(options, (res) => {
 let data = '';
 res.on('data', chunk => data += chunk);
 res.on('end', () => {
 try {
 if (res.statusCode === 200) {
 const json = JSON.parse(data);
 resolve({ success: true, data: json, empty: !json || json.length === 0 });
 } else if (res.statusCode === 404) {
 // ✅ Guilda não encontrada - erro crítico
 resolve({ success: false, notFound: true, status: 404 });
 } else if (res.statusCode === 429) {
 reject({ type: 'RATE_LIMIT', status: res.statusCode });
 } else {
 reject({ type: 'HTTP_ERROR', status: res.statusCode });
 }
 } catch (e) {
 reject({ type: 'PARSE_ERROR', message: e.message });
 }
 });
 });

 req.on('timeout', () => {
 req.destroy();
 reject({ type: 'TIMEOUT', message: `Timeout após ${timeout}ms` });
 });

 req.on('error', (error) => {
 reject({ type: 'NETWORK_ERROR', message: error.message, code: error.code });
 });

 req.end();
 });

 if (result.success) {
 if (result.empty) {
 emptyResponses++;
 if (emptyResponses >= endpoints.length) {
 // Todos endpoints retornaram vazio - guilda pode existir mas sem eventos
 console.log(`[Killboard] ℹ️ Guilda ${guildId} existe mas sem eventos recentes`);
 return [];
 }
 continue; // Tentar próximo endpoint
 }

 if (endpoint !== endpoints[0]) {
 console.log(`[Killboard] ✅ Sucesso usando endpoint alternativo: ${endpoint}`);
 }
 return result.data;
 }

 // ✅ DETECÇÃO DE GUILDA INVÁLIDA (404)
 if (result.notFound) {
 console.error(`[Killboard] ❌ Guilda ${guildId} retornou 404 em ${endpoint}`);
 return null; // Retorna null para indicar erro crítico
 }

 } catch (error) {
 const errorMsg = error.type || error.message || 'Erro desconhecido';
 console.error(`[Killboard] ❌ Falha em ${endpoint} (tentativa ${attempt}): ${errorMsg}`);
 lastError = error;

 // Se for rate limit, espera mais
 if (error.type === 'RATE_LIMIT') {
 await this.delay(3000);
 continue;
 }

 // Se não for última tentativa, aguarda com backoff exponencial
 if (attempt < maxAttempts) {
 const backoff = 2000 * Math.pow(2, attempt - 1);
 console.log(`[Killboard] ⏳ Aguardando ${backoff}ms antes de retry...`);
 await this.delay(backoff);
 }
 }
 }

 console.log(`[Killboard] ⚠️ Endpoint ${endpoint} falhou, tentando próximo...`);
 }

 // Todas as tentativas em todos os endpoints falharam
 console.error(`[Killboard] 🔴 Todos os endpoints falharam para guilda ${guildId}`);
 return null; // Retorna null para indicar erro crítico (diferente de [] vazio)
 }

 /**
 * Delay helper
 */
 delay(ms) {
 return new Promise(resolve => setTimeout(resolve, ms));
 }

 /**
 * Processa um evento de kill
 */
 async processKill(guild, event, config) {
 try {
 const channel = guild.channels.cache.get(config.killChannelId);
 if (!channel) return;

 const embed = await this.createKillEmbed(event, config);
 const components = this.createEventComponents(event);

 await channel.send({ embeds: [embed], components });
 console.log(`[Killboard] 💀 Kill processado: ${event.EventId}`);
 } catch (error) {
 console.error('[Killboard] ❌ Erro ao processar kill:', error);
 }
 }

 /**
 * Processa um evento de death
 */
 async processDeath(guild, event, config) {
 try {
 const channel = guild.channels.cache.get(config.deathChannelId);
 if (!channel) return;

 const embed = await this.createDeathEmbed(event, config);
 const components = this.createEventComponents(event);

 await channel.send({ embeds: [embed], components });
 console.log(`[Killboard] ☠️ Death processado: ${event.EventId}`);
 } catch (error) {
 console.error('[Killboard] ❌ Erro ao processar death:', error);
 }
 }

 /**
 * Cria embed para kill (verde/vitória)
 */
 async createKillEmbed(event, config) {
 const killer = event.Killer;
 const victim = event.Victim;
 const participants = event.Participants || [];
 const groupMembers = event.GroupMembers || [];

 // Calcular valores totais
 const totalVictimValue = await this.calculateTotalValue(victim.Equipment, victim.Inventory);
 const fameGained = event.TotalVictimKillFame || 0;

 const embed = new EmbedBuilder()
 .setTitle('💀 KILL CONFIRMADO')
 .setDescription(`**${killer.Name}** matou **${victim.Name}**`)
 .setColor(0x2ECC71) // Verde
 .setThumbnail(this.getItemImageUrl(killer.Equipment?.MainHand?.Type, killer.Equipment?.MainHand?.Quality))
 .setTimestamp(new Date(event.TimeStamp))
 .setFooter({ text: `Event ID: ${event.EventId} • Albion Killboard` });

 // Informações do Killer (nosso membro)
 embed.addFields({
 name: `⚔️ ${killer.Name} ${killer.GuildName ? `[${killer.GuildName}]` : ''}`,
 value: [
 `🏆 **Fama Ganha:** ${fameGained.toLocaleString()}`,
 `⚔️ **IP Médio:** ${Math.round(killer.AverageItemPower || 0)}`,
 `👥 **Participantes:** ${participants.length}`,
 killer.AllianceName ? `🤝 **Aliança:** ${killer.AllianceName}` : ''
 ].filter(Boolean).join('\n'),
 inline: true
 });

 // Informações da Vítima
 embed.addFields({
 name: `☠️ ${victim.Name} ${victim.GuildName ? `[${victim.GuildName}]` : ''}`,
 value: [
 `💰 **Valor Total:** ${this.formatSilver(totalVictimValue)}`,
 `🛡️ **IP Médio:** ${Math.round(victim.AverageItemPower || 0)}`,
 victim.AllianceName ? `🤝 **Aliança:** ${victim.AllianceName}` : ''
 ].filter(Boolean).join('\n'),
 inline: true
 });

 // Equipamento do Killer (resumo)
 if (config.showGear) {
 const gearText = this.formatEquipment(killer.Equipment);
 if (gearText) {
 embed.addFields({
 name: '🎒 Equipamento Usado',
 value: gearText,
 inline: false
 });
 }
 }

 // Loot/Equipamento da Vítima (destaque)
 if (config.showGear) {
 const victimGearText = this.formatEquipment(victim.Equipment, true);
 if (victimGearText) {
 embed.addFields({
 name: '💎 Loot Disponível',
 value: victimGearText,
 inline: false
 });
 }
 }

 // Inventário da vítima (itens na bag)
 if (config.showInventory && victim.Inventory && victim.Inventory.length > 0) {
 const inventoryValue = await this.calculateInventoryValue(victim.Inventory);
 const inventoryText = this.formatInventory(victim.Inventory);

 embed.addFields({
 name: `🎒 Inventário (${victim.Inventory.length} itens) - ${this.formatSilver(inventoryValue)}`,
 value: inventoryText || '*Inventário vazio*',
 inline: false
 });
 }

 // Localização (se disponível)
 if (event.Location) {
 embed.addFields({
 name: '🗺️ Localização',
 value: event.Location,
 inline: true
 });
 }

 return embed;
 }

 /**
 * Cria embed para death (vermelho/derrota)
 */
 async createDeathEmbed(event, config) {
 const killer = event.Killer;
 const victim = event.Victim; // Nosso membro

 // Calcular valores totais perdidos
 const totalLostValue = await this.calculateTotalValue(victim.Equipment, victim.Inventory);
 const fameLost = event.TotalVictimKillFame || 0;

 const embed = new EmbedBuilder()
 .setTitle('☠️ MEMBRO MORTO')
 .setDescription(`**${victim.Name}** foi morto por **${killer.Name}**`)
 .setColor(0xE74C3C) // Vermelho
 .setThumbnail(this.getItemImageUrl(victim.Equipment?.MainHand?.Type, victim.Equipment?.MainHand?.Quality))
 .setTimestamp(new Date(event.TimeStamp))
 .setFooter({ text: `Event ID: ${event.EventId} • Albion Killboard` });

 // Nosso membro (vítima) - destaque
 embed.addFields({
 name: `☠️ ${victim.Name} [PERDEU]`,
 value: [
 `💰 **Valor Perdido:** ${this.formatSilver(totalLostValue)}`,
 `🏆 **Fama Perdida:** ${fameLost.toLocaleString()}`,
 `🛡️ **IP Médio:** ${Math.round(victim.AverageItemPower || 0)}`,
 victim.GuildName ? `🏰 **Guilda:** ${victim.GuildName}` : ''
 ].filter(Boolean).join('\n'),
 inline: true
 });

 // Killer (inimigo)
 embed.addFields({
 name: `⚔️ ${killer.Name} [MATOU]`,
 value: [
 `⚔️ **IP Médio:** ${Math.round(killer.AverageItemPower || 0)}`,
 killer.GuildName ? `🏰 **Guilda:** ${killer.GuildName}` : '',
 killer.AllianceName ? `🤝 **Aliança:** ${killer.AllianceName}` : ''
 ].filter(Boolean).join('\n'),
 inline: true
 });

 // Equipamento perdido (DETALHADO)
 if (config.showGear) {
 const lostGearText = this.formatEquipment(victim.Equipment, true, true);
 if (lostGearText) {
 embed.addFields({
 name: '💔 Equipamento Perdido',
 value: lostGearText,
 inline: false
 });
 }
 }

 // Inventário perdido
 if (config.showInventory && victim.Inventory && victim.Inventory.length > 0) {
 const inventoryValue = await this.calculateInventoryValue(victim.Inventory);
 const inventoryText = this.formatInventory(victim.Inventory);

 embed.addFields({
 name: `🎒 Inventário Perdido (${victim.Inventory.length} itens) - ${this.formatSilver(inventoryValue)}`,
 value: inventoryText || '*Inventário vazio*',
 inline: false
 });
 }

 // Análise de risco (opcional)
 const riskLevel = this.calculateRiskLevel(totalLostValue);
 embed.addFields({
 name: '⚠️ Nível de Risco',
 value: riskLevel,
 inline: true
 });

 return embed;
 }

 /**
 * Formata equipamento para exibição
 */
 formatEquipment(equipment, showValues = false, highlightLost = false) {
 if (!equipment) return null;

 const slots = [
 { key: 'MainHand', icon: '⚔️', name: 'Arma' },
 { key: 'OffHand', icon: '🛡️', name: 'Offhand' },
 { key: 'Head', icon: '🎩', name: 'Capacete' },
 { key: 'Armor', icon: '👕', name: 'Armadura' },
 { key: 'Shoes', icon: '👢', name: 'Botas' },
 { key: 'Cape', icon: '🦇', name: 'Capa' },
 { key: 'Mount', icon: '🐴', name: 'Montaria' },
 { key: 'Bag', icon: '🎒', name: 'Bolsa' },
 { key: 'Potion', icon: '🧪', name: 'Poção' },
 { key: 'Food', icon: '🍖', name: 'Comida' }
 ];

 const lines = [];

 for (const slot of slots) {
 const item = equipment[slot.key];
 if (item && item.Type) {
 const tier = this.getItemTier(item.Type);
 const enchant = item.Count > 1 ? `.${item.Count - 1}` : '';
 const quality = this.getQualityStars(item.Quality);
 const itemValue = showValues ? `(${this.formatSilver(this.getItemValue(item))})` : '';

 lines.push(`${slot.icon} **${slot.name}:** ${tier}${enchant} ${quality} ${itemValue}`);
 } else if (highlightLost) {
 lines.push(`${slot.icon} **${slot.name}:** ❌ *Vazio*`);
 }
 }

 return lines.join('\n') || null;
 }

 /**
 * Formata inventário
 */
 formatInventory(inventory) {
 if (!inventory || inventory.length === 0) return null;

 const items = inventory
 .filter(item => item && item.Type)
 .slice(0, 15) // Limitar a 15 itens no embed
 .map(item => {
 const tier = this.getItemTier(item.Type);
 const count = item.Count > 1 ? ` x${item.Count}` : '';
 return `• ${tier}${count}`;
 });

 if (inventory.length > 15) {
 items.push(`... e mais ${inventory.length - 15} itens`);
 }

 return items.join('\n');
 }

 /**
 * Calcula valor total de equipamento + inventário
 */
 async calculateTotalValue(equipment, inventory) {
 let total = 0;

 // Valor do equipamento (estimativa baseada no tier/quality)
 if (equipment) {
 for (const [slot, item] of Object.entries(equipment)) {
 if (item && item.Type) {
 total += this.getItemValue(item);
 }
 }
 }

 // Valor do inventário
 if (inventory) {
 total += await this.calculateInventoryValue(inventory);
 }

 return total;
 }

 /**
 * Calcula valor do inventário
 */
 async calculateInventoryValue(inventory) {
 if (!inventory) return 0;

 let total = 0;
 for (const item of inventory) {
 if (item && item.Type) {
 total += this.getItemValue(item) * (item.Count || 1);
 }
 }
 return total;
 }

 /**
 * Estima valor de um item baseado no tier/quality
 */
 getItemValue(item) {
 if (!item || !item.Type) return 0;

 const tier = this.getItemTier(item.Type);
 const tierNum = parseInt(tier.replace('T', '')) || 1;
 const quality = item.Quality || 1;
 const enchant = item.Count > 1 ? (item.Count - 1) : 0;

 // Fórmula estimada (muito simplificada)
 const baseValue = Math.pow(2, tierNum) * 100;
 const qualityMultiplier = [1, 1, 1.5, 2, 2.5, 3][quality] || 1;
 const enchantMultiplier = 1 + (enchant * 0.5);

 return Math.round(baseValue * qualityMultiplier * enchantMultiplier);
 }

 /**
 * Obtém tier do item pelo ID
 */
 getItemTier(itemType) {
 if (!itemType) return 'T1';
 const match = itemType.match(/T(\d+)/);
 return match ? `T${match[1]}` : 'T1';
 }

 /**
 * Converte qualidade para estrelas
 */
 getQualityStars(quality) {
 const stars = ['', '⭐', '⭐⭐', '⭐⭐⭐', '⭐⭐⭐⭐', '⭐⭐⭐⭐⭐'];
 return stars[quality] || '';
 }

 /**
 * Formata prata (silver)
 */
 formatSilver(amount) {
 if (amount >= 1000000) {
 return `${(amount / 1000000).toFixed(1)}M 💰`;
 } else if (amount >= 1000) {
 return `${(amount / 1000).toFixed(1)}k 💰`;
 }
 return `${amount} 💰`;
 }

 /**
 * Calcula nível de risco baseado no valor perdido
 */
 calculateRiskLevel(value) {
 if (value > 10000000) return '🔴 **CRÍTICO** - Perda Mássima!';
 if (value > 5000000) return '🟠 **ALTO** - Perda Significativa';
 if (value > 1000000) return '🟡 **MÉDIO** - Perda Moderada';
 if (value > 500000) return '🟢 **BAIXO** - Perda Pequena';
 return '⚪ **MÍNIMO** - Sem grandes perdas';
 }

 /**
 * Gera URL da imagem do item
 */
 getItemImageUrl(itemType, quality = 1) {
 if (!itemType) return 'https://render.albiononline.com/v1/item/EMPTY.png';
 return `https://render.albiononline.com/v1/item/${itemType}.png?quality=${quality}&size=64`;
 }

 /**
 * Cria componentes (botões) para o evento
 */
 createEventComponents(event) {
 return new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setLabel('🔗 Ver no Albion Online')
 .setStyle(ButtonStyle.Link)
 .setURL(`https://albiononline.com/pt/killboard/kill/${event.EventId}`),
 new ButtonBuilder()
 .setLabel('🔄 Atualizar Dados')
 .setStyle(ButtonStyle.Secondary)
 .setCustomId(`killboard_refresh_${event.EventId}`)
 );
 }

 /**
 * ✅ NOVO: Retorna estatísticas de polling (para comando de status)
 */
 getPollingStats(guildId) {
 const stats = this.pollingStats.get(guildId);
 if (!stats) return null;

 return {
 ...stats,
 isRunning: this.pollingIntervals.has(guildId),
 nextCheckIn: stats.isPaused ? null : new Date(Date.now() + stats.currentInterval).toISOString()
 };
 }

 /**
 * ✅ NOVO: Força reinício do polling (para comando admin)
 */
 async restartPolling(guildId) {
 const config = global.guildConfig?.get(guildId)?.killboard;
 if (!config) return false;

 console.log(`[Killboard] 🔄 Reiniciando polling manualmente para guild ${guildId}`);
 this.resetPollingStats(guildId);
 this.stopPolling(guildId);

 // Revalidar guilda
 if (config.guildIdAlbion) {
 const valid = await this.validateGuildExists(config.guildIdAlbion);
 if (!valid) {
 throw new Error(`Guilda ${config.guildIdAlbion} não existe`);
 }
 }

 this.startPolling(guildId, config);
 return true;
 }

 /**
 * Envia painel de configuração do killboard
 */
 async sendConfigPanel(channel) {
 const embed = new EmbedBuilder()
 .setTitle('💀 Sistema de Killboard')
 .setDescription(
 '**Monitoramento automático de Kills e Deaths**\n\n' +
 '📊 **Canais:**\n' +
 '• 💀-kill-feed - Kills da guilda\n' +
 '• ☠️-death-feed - Mortes da guilda\n\n' +
 '**Features:**\n' +
 '✅ Atualização automática (com backoff inteligente)\n' +
 '✅ Detecção de guilda inválida\n' +
 '✅ Imagens de equipamentos\n' +
 '✅ Cálculo de valores\n' +
 '✅ Fama PvP\n' +
 '✅ Inventário completo\n\n' +
 '**Comandos:**\n' +
 '`/killboard config [guildId]` - Configurar guilda\n' +
 '`/killboard toggle` - Ativar/Desativar\n' +
 '`/killboard status` - Ver status do sistema\n' +
 '`/killboard restart` - Reiniciar polling'
 )
 .setColor(0x9B59B6);

 const buttons = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId('killboard_config')
 .setLabel('⚙️ Configurar')
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId('killboard_test_kill')
 .setLabel('💀 Testar Kill')
 .setStyle(ButtonStyle.Success),
 new ButtonBuilder()
 .setCustomId('killboard_test_death')
 .setLabel('☠️ Testar Death')
 .setStyle(ButtonStyle.Danger)
 );

 await channel.send({ embeds: [embed], components: [buttons] });
 }
}

module.exports = new KillboardHandler();