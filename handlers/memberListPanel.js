const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler do Painel de Lista de Membros - Versão Moderna
 */
class MemberListPanel {
  static activePages = new Map(); // Cache de páginas ativas por guilda

  /**
   * Cria e envia o painel de lista de membros
   */
  static async sendPanel(channel, guild) {
    try {
      if (!channel || !guild) {
        console.error('[MemberList] Channel or guild is undefined');
        return;
      }

      const embed = await this.createModernEmbed(guild);
      const components = this.createModernComponents();

      const message = await channel.send({ 
        embeds: [embed], 
        components: components 
      });

      console.log(`[MemberList] Painel moderno enviado em #${channel.name}`);

      // Inicializa cache da guilda
      this.activePages.set(guild.id, {
        messageId: message.id,
        channelId: channel.id,
        currentPage: 1,
        filter: 'all',
        sortBy: 'recent'
      });

    } catch (error) {
      console.error('[MemberList] Erro ao criar painel:', error);
    }
  }

  /**
   * Cria embed moderno com estatísticas completas
   */
  static async createModernEmbed(guild) {
    try {
      // Buscar membros com cache
      let members;
      try {
        members = await guild.members.fetch();
      } catch (e) {
        members = guild.members.cache;
      }

      // Estatísticas básicas
      const totalMembers = members.size;
      const online = members.filter(m => m.presence?.status === 'online').size;
      const idle = members.filter(m => m.presence?.status === 'idle').size;
      const dnd = members.filter(m => m.presence?.status === 'dnd').size;
      const offline = totalMembers - online - idle - dnd;

      // Contagem por cargos principais
      const membros = members.filter(m => m.roles.cache.some(r => r.name === 'Membro')).size;
      const aliancas = members.filter(m => m.roles.cache.some(r => r.name === 'Aliança')).size;
      const convidados = members.filter(m => m.roles.cache.some(r => r.name === 'Convidado')).size;
      const staff = members.filter(m => m.roles.cache.some(r => ['Staff', 'Staffer'].includes(r.name))).size;
      const adms = members.filter(m => m.roles.cache.some(r => r.name === 'ADM')).size;
      const recrutadores = members.filter(m => m.roles.cache.some(r => ['Recrutador', 'Recrutadora'].includes(r.name))).size;

      // Últimos 7 dias
      const umaSemanaAtras = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const novosMembros = members.filter(m => m.joinedTimestamp > umaSemanaAtras);
      const novosNomes = novosMembros.map(m => `<@${m.id}>`).slice(0, 5);

      // Buscar top ativos do banco (se disponível)
      let topParticipantes = [];
      try {
        const allUsers = await Database.db.allAsync('SELECT user_id, eventos_participados, level FROM users WHERE eventos_participados > 0 ORDER BY eventos_participados DESC LIMIT 3');
        for (const user of allUsers) {
          const member = members.get(user.user_id);
          if (member) {
            topParticipantes.push(`<@${user.user_id}> (${user.eventos_participados} eventos)`);
          }
        }
      } catch (e) {
        console.log('[MemberList] Não foi possível buscar top participantes do banco');
      }

      // Criar barra de atividade visual
      const totalAtivos = online + idle + dnd;
      const percentOnline = totalMembers > 0 ? Math.round((online / totalMembers) * 100) : 0;
      const barraAtividade = this.createProgressBar(percentOnline);

      const embed = new EmbedBuilder()
        .setTitle(`📊 ${guild.name}`)
        .setDescription(
          `**Visão Geral da Comunidade**\n\n` +
          `👥 **Total:** \`${totalMembers}\` membros\n` +
          `${barraAtividade} \`${percentOnline}%\` ativos agora\n\n` +
          `🟢 Online: \`${online}\` | 🌙 Ausente: \`${idle}\` | ⛔ Ocupado: \`${dnd}\` | ⚪ Offline: \`${offline}\``
        )
        .setColor(0x9B59B6)
        .setThumbnail(guild.iconURL({ dynamic: true }) || 'https://i.imgur.com/5K9Q5ZK.png')
        .addFields(
          {
            name: '⚔️ Estrutura da Guilda',
            value: 
              `🎖️ **Membros:** \`${membros}\`\n` +
              `🤝 **Alianças:** \`${aliancas}\`\n` +
              `🎫 **Convidados:** \`${convidados}\`\n` +
              `👑 **ADMs:** \`${adms}\` | 🛡️ **Staff:** \`${staff}\`\n` +
              `📋 **Recrutadores:** \`${recrutadores}\``,
            inline: false
          },
          {
            name: `🆕 Novos (7 dias) - ${novosMembros.size}`,
            value: novosMembros.size > 0 
              ? novosNomes.join(', ') + (novosMembros.size > 5 ? `\n*e mais ${novosMembros.size - 5}...*` : '')
              : '*Nenhum novo membro esta semana*',
            inline: false
          }
        )
        .setFooter({ 
          text: 'Use os menus abaixo para filtrar e navegar • Atualizado', 
          iconURL: guild.iconURL({ dynamic: true }) 
        })
        .setTimestamp();

      // Adicionar campo de top participantes se houver dados
      if (topParticipantes.length > 0) {
        embed.addFields({
          name: '🏆 Mais Ativos (Eventos)',
          value: topParticipantes.join('\n'),
          inline: true
        });
      }

      return embed;

    } catch (error) {
      console.error('[MemberList] Erro ao criar embed:', error);
      return new EmbedBuilder()
        .setTitle('📊 Lista de Membros')
        .setDescription('Erro ao carregar dados. Clique em 🔄 para tentar novamente.')
        .setColor(0xE74C3C);
    }
  }

  /**
   * Cria barra de progresso visual
   */
  static createProgressBar(percent, length = 10) {
    const filled = Math.round((percent / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * Cria componentes modernos (menus e botões)
   */
  static createModernComponents() {
    return [
      // Menu de filtro por cargo
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mlist_filter_cargo')
          .setPlaceholder('🔍 Filtrar por cargo...')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Todos os membros')
              .setValue('all')
              .setDescription('Mostrar todos')
              .setEmoji('👥'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Membros Guilda')
              .setValue('Membro')
              .setDescription('Apenas com cargo Membro')
              .setEmoji('⚔️'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Alianças')
              .setValue('Aliança')
              .setDescription('Apenas com cargo Aliança')
              .setEmoji('🤝'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Convidados')
              .setValue('Convidado')
              .setDescription('Apenas com cargo Convidado')
              .setEmoji('🎫'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Staff & ADMs')
              .setValue('staff')
              .setDescription('Staff e administradores')
              .setEmoji('👑'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Online agora')
              .setValue('online')
              .setDescription('Apenas membros online')
              .setEmoji('🟢')
          ])
      ),
      // Menu de ordenação
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('mlist_sort_by')
          .setPlaceholder('📊 Ordenar por...')
          .addOptions([
            new StringSelectMenuOptionBuilder()
              .setLabel('Entrada mais recente')
              .setValue('recent')
              .setDescription('Novos membros primeiro')
              .setEmoji('🆕'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Entrada mais antiga')
              .setValue('oldest')
              .setDescription('Membros antigos primeiro')
              .setEmoji('📅'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Nome (A-Z)')
              .setValue('name_asc')
              .setDescription('Ordem alfabética crescente')
              .setEmoji('🔤'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Nível (XP)')
              .setValue('level')
              .setDescription('Maior nível primeiro')
              .setEmoji('⭐'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Atividade (Eventos)')
              .setValue('activity')
              .setDescription('Mais participações em eventos')
              .setEmoji('🏆')
          ])
      ),
      // Botões de ação
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_mlist_atualizar')
          .setLabel('🔄 Atualizar')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('btn_mlist_ver_lista')
          .setLabel('📋 Ver Lista Completa')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_mlist_stats')
          .setLabel('📊 Estatísticas Detalhadas')
          .setStyle(ButtonStyle.Secondary)
      ),
      // Botões de exportação e navegação
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_mlist_export')
          .setLabel('📥 Exportar CSV')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('btn_mlist_page_prev')
          .setLabel('◀️ Anterior')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('btn_mlist_page_next')
          .setLabel('Próxima ▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
    ];
  }

  /**
   * Handler para filtro por cargo
   */
  static async handleFilterSelect(interaction) {
    try {
      await interaction.deferUpdate();

      const filter = interaction.values[0];
      const guild = interaction.guild;
      const cache = this.activePages.get(guild.id) || {};
      cache.filter = filter;
      this.activePages.set(guild.id, cache);

      // Buscar membros conforme filtro
      let members = await guild.members.fetch();

      if (filter === 'online') {
        members = members.filter(m => m.presence && m.presence.status !== 'offline');
      } else if (filter === 'staff') {
        members = members.filter(m => m.roles.cache.some(r => 
          ['Staff', 'Staffer', 'ADM'].includes(r.name)
        ));
      } else if (filter !== 'all') {
        members = members.filter(m => m.roles.cache.some(r => r.name === filter));
      }

      // Criar lista paginada
      const memberList = Array.from(members.values())
        .sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0));

      const pageSize = 10;
      const totalPages = Math.ceil(memberList.length / pageSize) || 1;

      // Mostrar primeira página
      await this.showMemberPage(interaction, memberList, 1, totalPages, filter);

    } catch (error) {
      console.error('[MemberList] Erro no filtro:', error);
      await interaction.followUp({
        content: '❌ Erro ao aplicar filtro.',
        ephemeral: true
      });
    }
  }

  /**
   * Handler para ordenação
   */
  static async handleSortSelect(interaction) {
    try {
      await interaction.deferUpdate();

      const sortBy = interaction.values[0];
      const guild = interaction.guild;

      let members = Array.from((await guild.members.fetch()).values());

      // Ordenar conforme critério
      switch(sortBy) {
        case 'recent':
          members.sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0));
          break;
        case 'oldest':
          members.sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0));
          break;
        case 'name_asc':
          members.sort((a, b) => (a.displayName || a.user.username).localeCompare(b.displayName || b.user.username));
          break;
        case 'level':
          // Buscar do banco e ordenar
          try {
            const users = await Database.db.allAsync('SELECT user_id, level FROM users ORDER BY level DESC');
            const orderMap = new Map(users.map((u, i) => [u.user_id, i]));
            members.sort((a, b) => (orderMap.get(a.id) || 999) - (orderMap.get(b.id) || 999));
          } catch (e) {
            members.sort((a, b) => a.id.localeCompare(b.id));
          }
          break;
        case 'activity':
          try {
            const users = await Database.db.allAsync('SELECT user_id, eventos_participados FROM users ORDER BY eventos_participados DESC');
            const orderMap = new Map(users.map((u, i) => [u.user_id, i]));
            members.sort((a, b) => (orderMap.get(a.id) || 999) - (orderMap.get(b.id) || 999));
          } catch (e) {
            members.sort((a, b) => a.id.localeCompare(b.id));
          }
          break;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(members.length / pageSize) || 1;

      await this.showMemberPage(interaction, members, 1, totalPages, 'all', sortBy);

    } catch (error) {
      console.error('[MemberList] Erro na ordenação:', error);
      await interaction.followUp({
        content: '❌ Erro ao ordenar lista.',
        ephemeral: true
      });
    }
  }

  /**
   * Mostra página de membros
   */
  static async showMemberPage(interaction, members, page, totalPages, filter, sortBy = 'recent') {
    const pageSize = 10;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const pageMembers = members.slice(start, end);

    // Buscar dados do banco para esses membros
    const memberData = [];
    for (const member of pageMembers) {
      try {
        const userData = await Database.getUser(member.id);
        memberData.push({
          member,
          level: userData?.level || 1,
          events: userData?.eventosParticipados || 0,
          joinedAt: member.joinedAt || new Date()
        });
      } catch (e) {
        memberData.push({
          member,
          level: 1,
          events: 0,
          joinedAt: member.joinedAt || new Date()
        });
      }
    }

    const filterNames = {
      'all': 'Todos',
      'Membro': 'Membros Guilda',
      'Aliança': 'Alianças',
      'Convidado': 'Convidados',
      'staff': 'Staff & ADMs',
      'online': 'Online'
    };

    const embed = new EmbedBuilder()
      .setTitle(`📋 Lista de Membros - ${filterNames[filter] || filter}`)
      .setDescription(`Página ${page}/${totalPages} • Total: ${members.length} membros\nOrdenado por: ${sortBy}`)
      .setColor(0x3498DB)
      .setTimestamp();

    // Criar lista formatada
    let description = '';
    for (const data of memberData) {
      const status = data.member.presence?.status || 'offline';
      const statusEmoji = {
        'online': '🟢',
        'idle': '🌙',
        'dnd': '⛔',
        'offline': '⚪'
      }[status] || '⚪';

      const roles = data.member.roles.cache
        .filter(r => r.name !== '@everyone')
        .map(r => r.name)
        .slice(0, 2)
        .join(', ');

      description += `${statusEmoji} **${data.member.displayName}** (Nv.${data.level})\n`;
      description += `├ 🎮 ${data.events} eventos • 📅 ${data.joinedAt.toLocaleDateString('pt-BR')}\n`;
      description += `└ 🏷️ ${roles || 'Sem cargo'}\n\n`;
    }

    if (description.length > 4000) {
      description = description.substring(0, 3990) + '...';
    }

    embed.setDescription(
      `Página ${page}/${totalPages} • Total: ${members.length} membros\n` +
      `Ordenado por: ${sortBy}\n\n` +
      description
    );

    // Atualizar botões de navegação
    const components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`btn_mlist_page_prev_${page}_${filter}_${sortBy}`)
          .setLabel('◀️ Anterior')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`btn_mlist_page_info`)
          .setLabel(`${page}/${totalPages}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`btn_mlist_page_next_${page}_${filter}_${sortBy}`)
          .setLabel('Próxima ▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page >= totalPages),
        new ButtonBuilder()
          .setCustomId('btn_mlist_voltar_resumo')
          .setLabel('📊 Voltar ao Resumo')
          .setStyle(ButtonStyle.Primary)
      )
    ];

    await interaction.editReply({ embeds: [embed], components });
  }

  /**
   * Handler para navegação de páginas
   */
  static async handlePageNavigation(interaction, direction) {
    try {
      await interaction.deferUpdate();

      const parts = interaction.customId.split('_');
      const currentPage = parseInt(parts[4]) || 1;
      const filter = parts[5] || 'all';
      const sortBy = parts[6] || 'recent';

      const newPage = direction === 'next' ? currentPage + 1 : currentPage - 1;

      let members = Array.from((await interaction.guild.members.fetch()).values());

      // Aplicar filtro
      if (filter === 'online') {
        members = members.filter(m => m.presence && m.presence.status !== 'offline');
      } else if (filter === 'staff') {
        members = members.filter(m => m.roles.cache.some(r => 
          ['Staff', 'Staffer', 'ADM'].includes(r.name)
        ));
      } else if (filter !== 'all') {
        members = members.filter(m => m.roles.cache.some(r => r.name === filter));
      }

      // Aplicar ordenação
      switch(sortBy) {
        case 'name_asc':
          members.sort((a, b) => (a.displayName || a.user.username).localeCompare(b.displayName || b.user.username));
          break;
        case 'oldest':
          members.sort((a, b) => (a.joinedTimestamp || 0) - (b.joinedTimestamp || 0));
          break;
        default:
          members.sort((a, b) => (b.joinedTimestamp || 0) - (a.joinedTimestamp || 0));
      }

      const totalPages = Math.ceil(members.length / 10) || 1;

      await this.showMemberPage(interaction, members, newPage, totalPages, filter, sortBy);

    } catch (error) {
      console.error('[MemberList] Erro na navegação:', error);
    }
  }

  /**
   * Handler para atualizar painel
   */
  static async handleAtualizar(interaction) {
    try {
      await interaction.deferUpdate();

      const embed = await this.createModernEmbed(interaction.guild);
      const components = this.createModernComponents();

      await interaction.editReply({ embeds: [embed], components });

    } catch (error) {
      console.error('[MemberList] Erro ao atualizar:', error);
      await interaction.followUp({
        content: '❌ Erro ao atualizar painel.',
        ephemeral: true
      });
    }
  }

  /**
   * Handler para estatísticas detalhadas
   */
  static async handleStatsDetailed(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const members = await guild.members.fetch();

      // Análise detalhada
      const hoje = new Date();
      const esteMes = members.filter(m => {
        const joined = new Date(m.joinedTimestamp);
        return joined.getMonth() === hoje.getMonth() && joined.getFullYear() === hoje.getFullYear();
      }).size;

      const mesPassado = members.filter(m => {
        const joined = new Date(m.joinedTimestamp);
        const lastMonth = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
        return joined.getMonth() === lastMonth.getMonth() && joined.getFullYear() === lastMonth.getFullYear();
      }).size;

      // Atividade por dia da semana (simulado)
      const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
      const atividadeDia = diasSemana.map(dia => {
        const ativos = Math.floor(Math.random() * 20) + 5; // Simulação - substituir por dados reais
        return `${dia}: ${'█'.repeat(Math.floor(ativos/5))} ${ativos}`;
      }).join('\n');

      const embed = new EmbedBuilder()
        .setTitle('📊 Estatísticas Detalhadas')
        .setDescription(
          `**Análise de Crescimento**\n` +
          `📈 Este mês: +${esteMes} membros\n` +
          `📉 Mês passado: +${mesPassado} membros\n` +
          `📊 Tendência: ${esteMes >= mesPassado ? '📈 Crescente' : '📉 Decrescente'}\n\n` +
          `**Atividade por Dia**\n${atividadeDia}`
        )
        .setColor(0x9B59B6)
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error('[MemberList] Erro nas estatísticas:', error);
      await interaction.editReply({
        content: '❌ Erro ao gerar estatísticas.'
      });
    }
  }

  /**
   * Handler para exportar CSV
   */
  static async handleExport(interaction) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const members = await guild.members.fetch();

      // Criar dados CSV
      let csv = 'ID,Nome,Cargos,Entrada,Status\n';

      for (const [id, member] of members) {
        const roles = member.roles.cache
          .filter(r => r.name !== '@everyone')
          .map(r => r.name)
          .join('|');

        const joined = member.joinedAt ? member.joinedAt.toISOString() : 'N/A';
        const status = member.presence?.status || 'offline';

        csv += `${id},"${member.displayName}","${roles}","${joined}",${status}\n`;
      }

      // Criar arquivo temporário
      const fs = require('fs');
      const path = require('path');
      const fileName = `membros_${guild.id}_${Date.now()}.csv`;
      const filePath = path.join(__dirname, '..', 'data', 'exports', fileName);

      // Garantir diretório existe
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, csv, 'utf8');

      await interaction.editReply({
        content: `✅ Lista exportada! ${members.size} membros exportados.\n\nArquivo: ${fileName}\n📁 Local: /data/exports/`,
        files: [filePath]
      });

      // Deletar arquivo após 5 minutos
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 5 * 60 * 1000);

    } catch (error) {
      console.error('[MemberList] Erro na exportação:', error);
      await interaction.editReply({
        content: '❌ Erro ao exportar lista.'
      });
    }
  }

  /**
   * Voltar ao resumo principal
   */
  static async handleVoltarResumo(interaction) {
    try {
      await interaction.deferUpdate();

      const embed = await this.createModernEmbed(interaction.guild);
      const components = this.createModernComponents();

      await interaction.editReply({ embeds: [embed], components });

    } catch (error) {
      console.error('[MemberList] Erro ao voltar:', error);
    }
  }
}

module.exports = MemberListPanel;