const { 
 EmbedBuilder, 
 ActionRowBuilder, 
 ButtonBuilder, 
 ButtonStyle, 
 StringSelectMenuBuilder,
 PermissionFlagsBits 
} = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler de Estatísticas de Eventos - Versão Moderna
 * Filtros: Período (7d, 2s, 1m, 3m, 7m, 1a, total) e Cargo (Membro, Convidado, Aliança)
 */

class EventStatsHandler {
 static activeFilters = new Map(); // Armazena filtros ativos por guilda

 /**
  * Wrapper para compatibilidade
  */
 static async sendPanel(channel, guild) {
  try {
   console.log(`[EventStats] Wrapper sendPanel chamado`);
   return await this.createAndSendPanel(channel, guild);
  } catch (error) {
   console.error(`[EventStats] Erro no wrapper:`, error);
   throw error;
  }
 }

 /**
  * Cria e envia o painel moderno
  */
 static async createAndSendPanel(channel, guild) {
  try {
   if (!channel || !guild) {
    console.error('[EventStats] Channel ou Guild undefined');
    return;
   }

   if (!channel.isTextBased()) {
    console.error('[EventStats] Canal não é texto');
    return;
   }

   const botMember = await guild.members.fetch(channel.client.user.id).catch(() => guild.members.me);
   if (!botMember) {
    console.error('[EventStats] Bot member não encontrado');
    return;
   }

   const permissions = channel.permissionsFor(botMember);
   if (!permissions?.has(PermissionFlagsBits.SendMessages)) {
    console.error('[EventStats] Sem permissão para enviar mensagens');
    return;
   }

   // Dados iniciais (últimos 30 dias, todos os cargos)
   const periodDays = 30;
   const stats = await this.getParticipationStats(guild, periodDays);

   const embed = this.createModernEmbed(stats, guild, periodDays, 'Todos');
   const components = this.createComponents();

   const message = await channel.send({
    embeds: [embed],
    components: components
   });

   console.log(`[EventStats] Painel enviado em #${channel.name}`);

   // Armazena referência para atualizações futuras
   this.activeFilters.set(guild.id, {
    messageId: message.id,
    channelId: channel.id,
    periodDays: periodDays,
    roleFilter: null
   });

  } catch (error) {
   console.error('[EventStats] Erro criando painel:', error);
  }
 }

 /**
  * Busca estatísticas de participação
  */
 static async getParticipationStats(guild, days, roleFilter = null) {
  try {
   const since = Date.now() - (days * 24 * 60 * 60 * 1000);

   // Busca todos os eventos no período
   const events = await Database.db.allAsync(`
    SELECT * FROM events 
    WHERE guild_id = ? AND created_at > ?
    ORDER BY created_at DESC
   `, [guild.id, since]) || [];

   const participacao = new Map();
   let totalLoot = 0;

   for (const event of events) {
    let participantes = [];
    try {
     participantes = JSON.parse(event.participantes || '[]');
     if (!Array.isArray(participantes)) participantes = [];
    } catch (e) {
     participantes = [];
    }

    for (const [userId, data] of participantes) {
     // Se tem filtro de cargo, verifica
     if (roleFilter) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member) continue;

      const hasRole = member.roles.cache.some(r => 
       r.name.toLowerCase() === roleFilter.toLowerCase()
      );
      if (!hasRole) continue;
     }

     if (!participacao.has(userId)) {
      participacao.set(userId, {
       userId,
       count: 0,
       loot: 0,
       lastEvent: null
      });
     }

     const userStats = participacao.get(userId);
     userStats.count++;
     userStats.loot += data.valor || 0;
     totalLoot += data.valor || 0;

     if (!userStats.lastEvent || event.created_at > userStats.lastEvent) {
      userStats.lastEvent = event.created_at;
     }
    }
   }

   // Converte para array e ordena por quantidade de eventos
   const sorted = Array.from(participacao.values())
    .sort((a, b) => b.count - a.count);

   return {
    totalEvents: events.length,
    totalParticipants: sorted.length,
    totalLoot: totalLoot,
    topParticipants: sorted.slice(0, 15), // Top 15
    periodDays: days
   };

  } catch (error) {
   console.error('[EventStats] Erro buscando estatísticas:', error);
   return {
    totalEvents: 0,
    totalParticipants: 0,
    totalLoot: 0,
    topParticipants: [],
    periodDays: days
   };
  }
 }

 /**
  * Cria embed moderno
  */
 static createModernEmbed(stats, guild, periodDays, roleFilter) {
  const { 
   totalEvents, 
   totalParticipants, 
   totalLoot, 
   topParticipants 
  } = stats;

  const periodText = this.getPeriodText(periodDays);
  const roleText = roleFilter || 'Todos';

  let description = `> **Período:** ${periodText}\n`;
  description += `> **Filtro:** ${roleText}\n`;
  description += `> **Total de Eventos:** \`${totalEvents}\`\n\n`;

  // Lista de participantes
  if (topParticipants.length === 0) {
   description += '*Nenhuma participação registrada neste período*';
  } else {
   description += '**🏆 RANKING DE PARTICIPAÇÃO**\n\n';

   topParticipants.forEach((user, index) => {
    const pos = index + 1;
    const emoji = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `\`${pos}.\``;
    const percent = totalEvents > 0 ? ((user.count / totalEvents) * 100).toFixed(0) : 0;

    description += `${emoji} <@${user.userId}> — \`${user.count}\` eventos (${percent}%)\n`;
    description += `    └ Loot: \`${this.formatNumber(user.loot)}\` pratas\n\n`;
   });
  }

  const embed = new EmbedBuilder()
   .setTitle('📊 PAINEL DE EVENTOS')
   .setDescription(description)
   .setColor(0x9B59B6) // Roxo
   .setThumbnail(guild.iconURL({ dynamic: true }) || 'https://i.imgur.com/5K9Q5ZK.png')
   .addFields(
    {
     name: '👥 Participantes Únicos',
     value: `\`${totalParticipants}\``,
     inline: true
    },
    {
     name: '💰 Loot Distribuído',
     value: `\`${this.formatNumber(totalLoot)}\``,
     inline: true
    },
    {
     name: '📅 Média/Evento',
     value: totalEvents > 0 ? `\`${(totalParticipants / totalEvents).toFixed(1)}\`` : '`0`',
     inline: true
    }
   )
   .setFooter({ 
    text: 'NOTAG Bot • Sistema de Eventos', 
    iconURL: 'https://i.imgur.com/8QBYRrm.png' 
   })
   .setTimestamp();

  return embed;
 }

 /**
  * Cria componentes interativos (SelectMenus e Buttons)
  */
 static createComponents() {
  return [
   // Select Menu para Período
   new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
     .setCustomId('select_periodo_eventos')
     .setPlaceholder('📅 Selecione o período...')
     .addOptions([
      { label: 'Últimos 7 dias', value: '7', emoji: '📅', description: 'Eventos da última semana' },
      { label: 'Últimas 2 semanas', value: '14', emoji: '📆', description: 'Eventos dos últimos 14 dias' },
      { label: 'Último mês', value: '30', emoji: '🗓️', description: 'Eventos dos últimos 30 dias' },
      { label: 'Últimos 3 meses', value: '90', emoji: '📊', description: 'Eventos dos últimos 3 meses' },
      { label: 'Últimos 7 meses', value: '210', emoji: '📈', description: 'Eventos dos últimos 7 meses' },
      { label: 'Último ano', value: '365', emoji: '🎂', description: 'Eventos do último ano' },
      { label: 'Todo o período', value: '0', emoji: '♾️', description: 'Todos os eventos registrados' }
     ])
   ),
   // Select Menu para Cargo
   new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
     .setCustomId('select_cargo_eventos')
     .setPlaceholder('👥 Filtrar por cargo...')
     .addOptions([
      { label: 'Todos os cargos', value: 'all', emoji: '👥', description: 'Mostrar todos os participantes' },
      { label: 'Membros', value: 'Membro', emoji: '⚔️', description: 'Apenas membros da guilda' },
      { label: 'Convidados', value: 'Convidado', emoji: '🎉', description: 'Apenas convidados' },
      { label: 'Aliança', value: 'Aliança', emoji: '🤝', description: 'Apenas aliados' }
     ])
   ),
   // Botões de ação
   new ActionRowBuilder().addComponents(
    new ButtonBuilder()
     .setCustomId('btn_eventos_atualizar')
     .setLabel('🔄 Atualizar')
     .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
     .setCustomId('btn_eventos_exportar')
     .setLabel('📥 Exportar CSV')
     .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
     .setCustomId('btn_eventos_ajuda')
     .setLabel('❓ Ajuda')
     .setStyle(ButtonStyle.Secondary)
   )
  ];
 }

 /**
  * Handler para seleção de período
  */
 static async handlePeriodSelect(interaction) {
  try {
   await interaction.deferUpdate();

   const days = parseInt(interaction.values[0]);
   const guild = interaction.guild;

   // Recupera filtro de cargo atual se existir
   const currentFilter = this.activeFilters.get(guild.id);
   const roleFilter = currentFilter?.roleFilter;

   await interaction.editReply({ 
    content: '⏳ Atualizando estatísticas...',
    embeds: [],
    components: []
   });

   const stats = await this.getParticipationStats(guild, days === 0 ? 3650 : days, roleFilter);
   const embed = this.createModernEmbed(stats, guild, days, roleFilter || 'Todos');

   await interaction.editReply({
    content: null,
    embeds: [embed],
    components: this.createComponents()
   });

   // Atualiza cache
   this.activeFilters.set(guild.id, {
    ...currentFilter,
    periodDays: days,
    messageId: interaction.message.id,
    channelId: interaction.channel.id
   });

   console.log(`[EventStats] Período alterado para ${days}d por ${interaction.user.tag}`);

  } catch (error) {
   console.error('[EventStats] Erro na seleção de período:', error);
   await interaction.followUp({
    content: '❌ Erro ao alterar período.',
    ephemeral: true
   });
  }
 }

 /**
  * Handler para seleção de cargo
  */
 static async handleRoleSelect(interaction) {
  try {
   await interaction.deferUpdate();

   const roleValue = interaction.values[0];
   const guild = interaction.guild;

   // Recupera período atual
   const currentFilter = this.activeFilters.get(guild.id);
   const periodDays = currentFilter?.periodDays || 30;

   const roleFilter = roleValue === 'all' ? null : roleValue;

   await interaction.editReply({ 
    content: '⏳ Filtrando por cargo...',
    embeds: [],
    components: []
   });

   const stats = await this.getParticipationStats(guild, periodDays === 0 ? 3650 : periodDays, roleFilter);
   const embed = this.createModernEmbed(stats, guild, periodDays, roleFilter || 'Todos');

   await interaction.editReply({
    content: null,
    embeds: [embed],
    components: this.createComponents()
   });

   // Atualiza cache
   this.activeFilters.set(guild.id, {
    ...currentFilter,
    roleFilter: roleFilter,
    messageId: interaction.message.id,
    channelId: interaction.channel.id
   });

   console.log(`[EventStats] Filtro de cargo alterado para ${roleFilter} por ${interaction.user.tag}`);

  } catch (error) {
   console.error('[EventStats] Erro na seleção de cargo:', error);
   await interaction.followUp({
    content: '❌ Erro ao filtrar por cargo.',
    ephemeral: true
   });
  }
 }

 /**
  * Handler para atualização manual
  */
 static async handleAtualizar(interaction) {
  try {
   await interaction.deferUpdate();

   const guild = interaction.guild;
   const currentFilter = this.activeFilters.get(guild.id);
   const periodDays = currentFilter?.periodDays || 30;
   const roleFilter = currentFilter?.roleFilter;

   const stats = await this.getParticipationStats(guild, periodDays === 0 ? 3650 : periodDays, roleFilter);
   const embed = this.createModernEmbed(stats, guild, periodDays, roleFilter || 'Todos');

   await interaction.editReply({ embeds: [embed], components: this.createComponents() });

  } catch (error) {
   console.error('[EventStats] Erro na atualização:', error);
  }
 }

 /**
  * Converte dias para texto legível
  */
 static getPeriodText(days) {
  if (days === 0 || days >= 3650) return 'Todo o período';
  if (days === 7) return 'Últimos 7 dias';
  if (days === 14) return 'Últimas 2 semanas';
  if (days === 30) return 'Último mês';
  if (days === 90) return 'Últimos 3 meses';
  if (days === 210) return 'Últimos 7 meses';
  if (days === 365) return 'Último ano';
  return `Últimos ${days} dias`;
 }

 /**
  * Formata números
  */
 static formatNumber(num) {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return num.toLocaleString('pt-BR');
 }
}

module.exports = EventStatsHandler;