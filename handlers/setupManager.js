const {
 ChannelType,
 PermissionFlagsBits,
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle
} = require('discord.js');

class SetupManager {
 constructor(guild, interaction = null) {
 this.guild = guild;
 this.interaction = interaction;
 this.createdChannels = [];
 this.createdCategories = [];
 this.existingChannels = [];
 this.rolesChecked = [];
 this.deletedChannels = [];
 this.deletedCategories = [];
 this.deletedRoles = [];
 this.errors = [];
 }

 getServerStructure() {
 return [
 {
 name: '🛡️ RECRUTAMENTO',
 type: ChannelType.GuildCategory,
 channels: [
 { name: '📋╠registrar', type: ChannelType.GuildText },
 { name: '🎤╠Recrutamento', type: ChannelType.GuildVoice },
 { name: '📅╠agendamentos', type: ChannelType.GuildText }
 ]
 },
 {
 name: '⚙️ CONFIG',
 type: ChannelType.GuildCategory,
 channels: [
 { name: '🔧╠configurações', type: ChannelType.GuildText }
 ]
 },
 {
 name: '💰 BANCO DA GUILDA',
 type: ChannelType.GuildCategory,
 channels: [
 { name: '➕╠criar-evento', type: ChannelType.GuildText },
 { name: '👋╠participar', type: ChannelType.GuildText },
 { name: '🔍╠consultar-saldo', type: ChannelType.GuildText },
 { name: '💰╠venda-de-baú', type: ChannelType.GuildText },
 { name: '📊╠financeiro', type: ChannelType.GuildText },
 { name: '💵╠depósitos', type: ChannelType.GuildText },
 { name: '📜╠logs-banco', type: ChannelType.GuildText },
 { name: '🔊╠Aguardando-Evento', type: ChannelType.GuildVoice }
 ]
 },
 {
 name: '⚔️ EVENTOS ATIVOS',
 type: ChannelType.GuildCategory,
 channels: []
 },
 {
 name: '📁 EVENTOS ENCERRADOS',
 type: ChannelType.GuildCategory,
 channels: []
 },
 {
 name: '👥 GESTÃO DE MEMBROS',
 type: ChannelType.GuildCategory,
 channels: [
 { name: '📨╠solicitação-registro', type: ChannelType.GuildText },
 { name: '🚪╠saída-membros', type: ChannelType.GuildText },
 { name: '📋╠lista-membros', type: ChannelType.GuildText }
 ]
 },
 {
 name: '👑 GESTÃO DE GUILDA',
 type: ChannelType.GuildCategory,
 channels: [
 { name: '📊╠painel-de-eventos', type: ChannelType.GuildText },
 { name: '🏦╠saldo-guilda', type: ChannelType.GuildText }
 ]
 },
 {
 name: '🎓 ALBION ACADEMY',
 type: ChannelType.GuildCategory,
 channels: [
 { name: '👤╠perfil', type: ChannelType.GuildText },
 { name: '⭐╠xp-event', type: ChannelType.GuildText },
 { name: '📜╠log-xp', type: ChannelType.GuildText },
 { name: '🔮╠orb-xp', type: ChannelType.GuildText },
 { name: '📊╠painel-xp', type: ChannelType.GuildText }
 ]
 }
 ];
 }

 getRequiredRoles() {
 return [
 'ADM',
 'Staff',
 'Caller',
 'tesoureiro',
 'Recrutador',
 'Membro',
 'Convidado',
 'Aliança'
 ];
 }

 async install() {
 console.log('🏗️ Iniciando instalação da estrutura...');

 await this.setupRoles();

 const structure = this.getServerStructure();

 for (const categoryData of structure) {
 try {
 let category = this.guild.channels.cache.find(
 c => c.name === categoryData.name && c.type === ChannelType.GuildCategory
 );

 if (!category) {
 category = await this.guild.channels.create({
 name: categoryData.name,
 type: ChannelType.GuildCategory,
 permissionOverwrites: [
 {
 id: this.guild.id,
 allow: [PermissionFlagsBits.ViewChannel],
 deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
 }
 ]
 });
 this.createdCategories.push(categoryData.name);
 console.log(`✅ Categoria criada: ${categoryData.name}`);
 } else {
 this.existingChannels.push(categoryData.name);
 console.log(`⚠️ Categoria já existe: ${categoryData.name}`);
 }

 for (const channelData of categoryData.channels) {
 const channel = await this.createChannel(channelData, category);

 if (channel && channelData.name === '📋╠registrar') {
 const RegistrationPanel = require('./registrationPanel');
 const messages = await channel.messages.fetch({ limit: 10 });
 const existePainel = messages.some(m =>
 m.author.bot &&
 m.embeds.length > 0 &&
 m.embeds[0].title?.includes('Bem-vindo')
 );
 if (!existePainel) {
 await RegistrationPanel.sendPanel(channel);
 }
 }

 if (channel && channelData.name === '🔧╠configurações') {
 const existePainel = await this.checkExistingPanel(channel, 'CONFIGURAÇÕES');
 if (!existePainel) {
 await this.sendConfigPanel(channel);
 }
 }

 if (channel && channelData.name === '📋╠lista-membros') {
 const existePainel = await this.checkExistingPanel(channel, 'LISTA DE MEMBROS');
 if (!existePainel) {
 const MemberListPanel = require('./memberListPanel');
 await MemberListPanel.sendPanel(channel, this.guild);
 }
 }

 if (channel && channelData.name === '➕╠criar-evento') {
 const existePainel = await this.checkExistingPanel(channel, 'CENTRAL DE EVENTOS');
 if (!existePainel) {
 const EventPanel = require('./eventPanel');
 await EventPanel.sendPanel(channel);
 console.log(`✅ Painel de eventos enviado em ${channel.name}`);
 }
 }

 if (channel && channelData.name === '🔍╠consultar-saldo') {
 const existePainel = await this.checkExistingPanel(channel, 'CONSULTAR SALDO');
 if (!existePainel) {
 const ConsultarSaldoHandler = require('./consultarSaldoHandler');
 await ConsultarSaldoHandler.sendPanel(channel);
 console.log(`✅ Painel de consultar saldo enviado em ${channel.name}`);
 }
 }

 if (channel && channelData.name === '🏦╠saldo-guilda') {
 const existePainel = await this.checkExistingPanel(channel, 'SALDO DA GUILDA');
 if (!existePainel) {
 const BalancePanelHandler = require('./balancePanelHandler');
 await BalancePanelHandler.createAndSendPanel(channel);
 console.log(`✅ Painel de saldo da guilda enviado em ${channel.name}`);
 }
 }

 // 🎯 NOVO: Painel de Venda de Baú
 if (channel && channelData.name === '💰╠venda-de-baú') {
 const existePainel = await this.checkExistingPanel(channel, 'VENDA DE BAÚ');
 if (!existePainel) {
 const BauSaleHandler = require('./bauSaleHandler');
 await BauSaleHandler.sendPanel(channel);
 console.log(`✅ Painel de venda de baú enviado em ${channel.name}`);
 }
 }

 // 🎯 NOVO: Painel de Estatísticas de Eventos
 if (channel && channelData.name === '📊╠painel-de-eventos') {
 const existePainel = await this.checkExistingPanel(channel, 'PAINEL DE EVENTOS');
 if (!existePainel) {
 const EventStatsHandler = require('./eventStatsHandler');
 await EventStatsHandler.sendPanel(channel);
 console.log(`✅ Painel de estatísticas de eventos enviado em ${channel.name}`);
 }
 }
 }

 } catch (error) {
 console.error(`❌ Erro ao criar categoria ${categoryData.name}:`, error);
 this.errors.push(`${categoryData.name}: ${error.message}`);
 }
 }

 return {
 success: true,
 message: `Estrutura instalada com sucesso!\n🆕 ${this.createdChannels.length} canais criados\n📁 ${this.createdCategories.length} categorias criadas\n🎭 ${this.rolesChecked.length} cargos verificados`,
 createdChannels: this.createdChannels,
 createdCategories: this.createdCategories,
 existingChannels: this.existingChannels,
 rolesChecked: this.rolesChecked,
 errors: this.errors
 };
 }

 async update() {
 console.log('🔄 Iniciando atualização da estrutura...');

 await this.setupRoles();

 const structure = this.getServerStructure();

 for (const categoryData of structure) {
 try {
 let category = this.guild.channels.cache.find(
 c => c.name === categoryData.name && c.type === ChannelType.GuildCategory
 );

 if (!category) {
 category = await this.guild.channels.create({
 name: categoryData.name,
 type: ChannelType.GuildCategory,
 permissionOverwrites: [
 {
 id: this.guild.id,
 allow: [PermissionFlagsBits.ViewChannel],
 deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.Connect]
 }
 ]
 });
 this.createdCategories.push(categoryData.name);
 console.log(`✅ Categoria criada: ${categoryData.name}`);
 }

 for (const channelData of categoryData.channels) {
 const channel = await this.createChannel(channelData, category);

 if (channel) {
 if (channelData.name === '📋╠registrar') {
 const RegistrationPanel = require('./registrationPanel');
 const existePainel = await this.checkExistingPanel(channel, 'Bem-vindo');
 if (!existePainel) {
 await RegistrationPanel.sendPanel(channel);
 }
 }

 if (channelData.name === '🔧╠configurações') {
 const existePainel = await this.checkExistingPanel(channel, 'CONFIGURAÇÕES');
 if (!existePainel) {
 await this.sendConfigPanel(channel);
 }
 }

 if (channelData.name === '📋╠lista-membros') {
 const MemberListPanel = require('./memberListPanel');
 const existePainel = await this.checkExistingPanel(channel, 'LISTA DE MEMBROS');
 if (!existePainel) {
 await MemberListPanel.sendPanel(channel, this.guild);
 } else {
 await MemberListPanel.updatePanel(existePainel, this.guild);
 }
 }

 if (channelData.name === '➕╠criar-evento') {
 const EventPanel = require('./eventPanel');
 const existePainel = await this.checkExistingPanel(channel, 'CENTRAL DE EVENTOS');
 if (!existePainel) {
 await EventPanel.sendPanel(channel);
 }
 }

 if (channelData.name === '🔍╠consultar-saldo') {
 const ConsultarSaldoHandler = require('./consultarSaldoHandler');
 const existePainel = await this.checkExistingPanel(channel, 'CONSULTAR SALDO');
 if (!existePainel) {
 await ConsultarSaldoHandler.sendPanel(channel);
 }
 }

 if (channelData.name === '🏦╠saldo-guilda') {
 const BalancePanelHandler = require('./balancePanelHandler');
 const existePainel = await this.checkExistingPanel(channel, 'SALDO DA GUILDA');
 if (!existePainel) {
 await BalancePanelHandler.createAndSendPanel(channel);
 }
 }

 // 🎯 NOVO: Atualizar/criar painel de venda de baú
 if (channelData.name === '💰╠venda-de-baú') {
 const BauSaleHandler = require('./bauSaleHandler');
 const existePainel = await this.checkExistingPanel(channel, 'VENDA DE BAÚ');
 if (!existePainel) {
 await BauSaleHandler.sendPanel(channel);
 }
 }

 // 🎯 NOVO: Atualizar/criar painel de estatísticas
 if (channelData.name === '📊╠painel-de-eventos') {
 const EventStatsHandler = require('./eventStatsHandler');
 const existePainel = await this.checkExistingPanel(channel, 'PAINEL DE EVENTOS');
 if (!existePainel) {
 await EventStatsHandler.sendPanel(channel);
 }
 }
 }
 }

 } catch (error) {
 console.error(`❌ Erro: ${error.message}`);
 this.errors.push(error.message);
 }
 }

 return {
 success: true,
 message: `Atualização concluída!`,
 createdChannels: this.createdChannels,
 createdCategories: this.createdCategories,
 existingChannels: this.existingChannels,
 rolesChecked: this.rolesChecked,
 errors: this.errors
 };
 }

 async checkExistingPanel(channel, tituloContains) {
 try {
 const messages = await channel.messages.fetch({ limit: 50 });
 return messages.find(m =>
 m.author.bot &&
 m.embeds.length > 0 &&
 m.embeds[0].title?.includes(tituloContains)
 );
 } catch (error) {
 return null;
 }
 }

 async sendConfigPanel(channel) {
 try {
 if (!global.guildConfig) global.guildConfig = new Map();
 if (!global.guildConfig.has(this.guild.id)) {
 global.guildConfig.set(this.guild.id, {
 idioma: 'PT-BR',
 taxaGuilda: 10,
 guildaRegistrada: null,
 xpAtivo: false,
 taxasBau: {
 royal: 10,
 black: 15,
 brecilien: 12,
 avalon: 20
 },
 taxaEmprestimo: 5
 });
 }

 const config = global.guildConfig.get(this.guild.id);

 const embed = new EmbedBuilder()
 .setTitle('⚙️ **PAINEL DE CONFIGURAÇÕES**')
 .setDescription('Configure as opções do bot para este servidor.\n\n*Apenas membros com cargo **ADM** podem alterar estas configurações.*')
 .setColor(0x3498DB)
 .addFields(
 {
 name: '🌐 **Idioma**',
 value: `\`${config.idioma}\`\n*(Fixo por enquanto)*`,
 inline: true
 },
 {
 name: '💰 **Taxa da Guilda**',
 value: `\`${config.taxaGuilda}%\`\nTaxa em eventos`,
 inline: true
 },
 {
 name: '🏰 **Guilda Registrada**',
 value: config.guildaRegistrada
 ? `**${config.guildaRegistrada.nome}**\n🌍 ${config.guildaRegistrada.server}\n✅ Verificada`
 : '❌ *Nenhuma guilda registrada*',
 inline: false
 },
 {
 name: '⭐ **Sistema XP**',
 value: config.xpAtivo ? '✅ Ativado' : '🔴 Desativado',
 inline: true
 },
 {
 name: '📦 **Taxa Venda Baú**',
 value: config.taxasBau 
 ? `👑 ${config.taxasBau.royal}% | ⚫ ${config.taxasBau.black}%\n🌲 ${config.taxasBau.brecilien}% | 🔴 ${config.taxasBau.avalon}%`
 : '🔴 Não configurado',
 inline: true
 },
 {
 name: '💳 **Taxa Empréstimo**',
 value: `\`${config.taxaEmprestimo || 5}%\`\n✅ Ativo`,
 inline: true
 }
 )
 .setFooter({ text: 'Clique nos botões abaixo para configurar' })
 .setTimestamp();

 const buttons = [
 new ActionRowBuilder().addComponents(
 new ButtonBuilder()
 .setCustomId('config_idioma')
 .setLabel('🌐 Idioma')
 .setStyle(ButtonStyle.Secondary)
 .setDisabled(true),
 new ButtonBuilder()
 .setCustomId('config_taxa_guilda')
 .setLabel('💰 Taxa Guilda')
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId('config_registrar_guilda')
 .setLabel('🏰 Registrar Guilda')
 .setStyle(ButtonStyle.Success)
 ),
 new ActionRowBuilder().addComponents(
 new ButtonBuilder()
 .setCustomId('config_xp')
 .setLabel('⭐ Ativar/Desativar XP')
 .setStyle(ButtonStyle.Secondary),
 new ButtonBuilder()
 .setCustomId('config_taxa_bau')
 .setLabel('📦 Taxas Baú')
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId('config_taxa_emprestimo')
 .setLabel('💳 Taxa Empréstimo')
 .setStyle(ButtonStyle.Primary)
 ),
 new ActionRowBuilder().addComponents(
 new ButtonBuilder()
 .setCustomId('config_atualizar_bot')
 .setLabel('🔄 Atualizar Bot')
 .setStyle(ButtonStyle.Danger)
 .setEmoji('🔄')
 )
 ];

 await channel.send({
 embeds: [embed],
 components: buttons
 });

 console.log(`✅ Painel de configurações enviado em ${channel.name}`);
 } catch (error) {
 console.error('❌ Erro ao enviar painel de config:', error);
 this.errors.push(`Painel config: ${error.message}`);
 }
 }

 async createChannel(channelData, category) {
 try {
 const existingChannel = this.guild.channels.cache.find(
 c => c.name === channelData.name && c.parentId === category.id
 );

 if (existingChannel) {
 this.existingChannels.push(channelData.name);
 return existingChannel;
 }

 const permissions = this.getChannelPermissions(channelData.name);

 const channel = await this.guild.channels.create({
 name: channelData.name,
 type: channelData.type,
 parent: category.id,
 permissionOverwrites: permissions
 });

 this.createdChannels.push(channelData.name);
 console.log(`✅ Canal criado: ${channelData.name}`);
 return channel;

 } catch (error) {
 console.error(`❌ Erro ao criar canal ${channelData.name}:`, error);
 this.errors.push(`${channelData.name}: ${error.message}`);
 throw error;
 }
 }

 getChannelPermissions(channelName) {
 const permissions = [];

 permissions.push({
 id: this.guild.id,
 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
 deny: [PermissionFlagsBits.SendMessages]
 });

 const admRole = this.guild.roles.cache.find(r => r.name === 'ADM');
 const staffRole = this.guild.roles.cache.find(r => r.name === 'Staff');
 const tesoureiroRole = this.guild.roles.cache.find(r => r.name === 'tesoureiro');
 const recrutadorRole = this.guild.roles.cache.find(r => r.name === 'Recrutador');
 const membroRole = this.guild.roles.cache.find(r => r.name === 'Membro');

 if (admRole) {
 permissions.push({
 id: admRole.id,
 allow: [
 PermissionFlagsBits.ViewChannel,
 PermissionFlagsBits.SendMessages,
 PermissionFlagsBits.ManageMessages,
 PermissionFlagsBits.ManageChannels,
 PermissionFlagsBits.Connect,
 PermissionFlagsBits.Speak
 ]
 });
 }

 if (staffRole) {
 permissions.push({
 id: staffRole.id,
 allow: [
 PermissionFlagsBits.ViewChannel,
 PermissionFlagsBits.SendMessages,
 PermissionFlagsBits.ManageMessages,
 PermissionFlagsBits.Connect,
 PermissionFlagsBits.Speak
 ]
 });
 }

 if (channelName.includes('registrar')) {
 const everyonePerms = permissions.find(p => p.id === this.guild.id);
 if (everyonePerms) {
 everyonePerms.deny = everyonePerms.deny.filter(d => d !== PermissionFlagsBits.SendMessages);
 everyonePerms.allow.push(PermissionFlagsBits.SendMessages);
 }
 }

 if (channelName.includes('criar-evento') || channelName.includes('venda-de-baú')) {
 const everyonePerms = permissions.find(p => p.id === this.guild.id);
 if (everyonePerms) {
 everyonePerms.deny = everyonePerms.deny.filter(d => d !== PermissionFlagsBits.SendMessages);
 everyonePerms.allow.push(PermissionFlagsBits.UseApplicationCommands);
 }
 }

 if (channelName.includes('configurações')) {
 const everyonePerms = permissions.find(p => p.id === this.guild.id);
 if (everyonePerms) {
 everyonePerms.deny = [
 PermissionFlagsBits.SendMessages,
 PermissionFlagsBits.Connect,
 PermissionFlagsBits.AddReactions
 ];
 everyonePerms.allow = [
 PermissionFlagsBits.ViewChannel,
 PermissionFlagsBits.ReadMessageHistory
 ];
 }

 if (admRole) {
 permissions.push({
 id: admRole.id,
 allow: [
 PermissionFlagsBits.ViewChannel,
 PermissionFlagsBits.SendMessages,
 PermissionFlagsBits.ManageMessages,
 PermissionFlagsBits.UseApplicationCommands
 ]
 });
 }
 }

 if (channelName.includes('solicitação-registro')) {
 if (recrutadorRole) {
 permissions.push({
 id: recrutadorRole.id,
 allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages]
 });
 }
 if (membroRole) {
 permissions.push({
 id: membroRole.id,
 allow: [PermissionFlagsBits.ViewChannel],
 deny: [PermissionFlagsBits.SendMessages]
 });
 }
 }

 if (channelName.includes('financeiro') ||
 channelName.includes('depósitos') ||
 channelName.includes('logs-banco') ||
 channelName.includes('saldo-guilda')) {
 if (tesoureiroRole) {
 permissions.push({
 id: tesoureiroRole.id,
 allow: [
 PermissionFlagsBits.ViewChannel,
 PermissionFlagsBits.SendMessages,
 PermissionFlagsBits.ManageMessages
 ]
 });
 }
 }

 return permissions;
 }

 async setupRoles() {
 const requiredRoles = this.getRequiredRoles();

 for (const roleName of requiredRoles) {
 try {
 const existingRole = this.guild.roles.cache.find(r => r.name === roleName);
 if (!existingRole) {
 const newRole = await this.guild.roles.create({
 name: roleName,
 color: this.getRoleColor(roleName),
 permissions: this.getRolePermissions(roleName),
 reason: 'Setup inicial do bot'
 });

 this.rolesChecked.push(`${roleName} (novo)`);
 console.log(`✅ Cargo criado: ${roleName}`);
 } else {
 this.rolesChecked.push(`${roleName} (existente)`);
 console.log(`⚠️ Cargo já existe: ${roleName}`);
 }
 } catch (error) {
 console.error(`❌ Erro ao criar cargo ${roleName}:`, error);
 this.errors.push(`Cargo ${roleName}: ${error.message}`);
 }
 }
 }

 getRoleColor(roleName) {
 const colors = {
 'ADM': 0xE74C3C,
 'Staff': 0x9B59B6,
 'Caller': 0xF1C40F,
 'tesoureiro': 0x2ECC71,
 'Recrutador': 0x3498DB,
 'Membro': 0x1ABC9C,
 'Convidado': 0x95A5A6,
 'Aliança': 0xE67E22
 };
 return colors[roleName] || 0xFFFFFF;
 }

 getRolePermissions(roleName) {
 switch (roleName) {
 case 'ADM':
 return [PermissionFlagsBits.Administrator];
 case 'Staff':
 return [
 PermissionFlagsBits.KickMembers,
 PermissionFlagsBits.BanMembers,
 PermissionFlagsBits.ManageMessages,
 PermissionFlagsBits.ManageChannels,
 PermissionFlagsBits.ViewAuditLog
 ];
 case 'tesoureiro':
 return [PermissionFlagsBits.ManageMessages];
 case 'Recrutador':
 return [PermissionFlagsBits.ManageMessages];
 default:
 return [];
 }
 }

 async uninstall() {
 console.log('🗑️ Iniciando desinstalação completa...');

 const structure = this.getServerStructure();
 const channelsToDelete = [];
 const categoriesToDelete = [];

 for (const categoryData of structure) {
 const category = this.guild.channels.cache.find(
 c => c.name === categoryData.name && c.type === ChannelType.GuildCategory
 );
 if (category) {
 categoriesToDelete.push(category);

 for (const channelData of categoryData.channels) {
 const channel = this.guild.channels.cache.find(
 c => c.name === channelData.name && c.parentId === category.id
 );
 if (channel) {
 channelsToDelete.push(channel);
 }
 }
 }
 }

 for (const channel of channelsToDelete) {
 try {
 await channel.delete('Desinstalação do bot');
 this.deletedChannels.push(channel.name);
 console.log(`🗑️ Canal deletado: ${channel.name}`);
 } catch (error) {
 console.error(`❌ Erro ao deletar canal ${channel.name}:`, error);
 this.errors.push(`Canal ${channel.name}: ${error.message}`);
 }
 }

 for (const category of categoriesToDelete) {
 try {
 await category.delete('Desinstalação do bot');
 this.deletedCategories.push(category.name);
 console.log(`🗑️ Categoria deletada: ${category.name}`);
 } catch (error) {
 console.error(`❌ Erro ao deletar categoria ${category.name}:`, error);
 this.errors.push(`Categoria ${category.name}: ${error.message}`);
 }
 }

 const rolesToDelete = this.getRequiredRoles();

 for (const roleName of rolesToDelete) {
 try {
 const role = this.guild.roles.cache.find(r => r.name === roleName);

 if (role) {
 if (role.id === this.guild.id) {
 console.log(`⏭️ Pulando cargo @everyone`);
 continue;
 }

 await role.delete('Desinstalação do bot');
 this.deletedRoles.push(roleName);
 console.log(`🗑️ Cargo deletado: ${roleName}`);
 } else {
 console.log(`⚠️ Cargo não encontrado: ${roleName}`);
 }
 } catch (error) {
 console.error(`❌ Erro ao deletar cargo ${roleName}:`, error);
 this.errors.push(`Cargo ${roleName}: ${error.message}`);
 }
 }

 return {
 success: this.errors.length === 0,
 message: `Desinstalação concluída!\n🗑️ ${this.deletedChannels.length} canais removidos\n📁 ${this.deletedCategories.length} categorias removidas\n🎭 ${this.deletedRoles.length} cargos removidos`,
 deletedChannels: this.deletedChannels,
 deletedCategories: this.deletedCategories,
 deletedRoles: this.deletedRoles,
 errors: this.errors
 };
 }
}

module.exports = SetupManager;