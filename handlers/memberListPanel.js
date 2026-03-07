const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

class MemberListPanel {
  // Criar embed da lista de membros
  static async createMemberListEmbed(guild) {
    const membros = await guild.members.fetch();

    // Filtrar por cargos
    const cargosMembro = ['Membro', 'Aliança', 'Convidado'];
    const membrosPorCargo = {
      'Membro': [],
      'Aliança': [],
      'Convidado': []
    };

    membros.forEach(member => {
      if (member.user.bot) return;

      for (const cargoNome of cargosMembro) {
        if (member.roles.cache.some(r => r.name === cargoNome)) {
          const nick = member.nickname || member.user.username;
          const status = member.presence?.status || 'offline';
          const statusEmoji = {
            'online': '🟢',
            'idle': '🟡',
            'dnd': '🔴',
            'offline': '⚫'
          }[status] || '⚫';

          membrosPorCargo[cargoNome].push({
            nick: nick,
            user: member.user,
            status: statusEmoji,
            joinedAt: member.joinedAt
          });
          break;
        }
      }
    });

    // Ordenar por data de entrada (mais antigos primeiro)
    for (const cargo in membrosPorCargo) {
      membrosPorCargo[cargo].sort((a, b) => a.joinedAt - b.joinedAt);
    }

    const embed = new EmbedBuilder()
      .setTitle('📋 LISTA DE MEMBROS')
      .setDescription(`**${guild.name}**\nTotal de membros registrados: **${
        membrosPorCargo['Membro'].length + 
        membrosPorCargo['Aliança'].length + 
        membrosPorCargo['Convidado'].length
      }**`)
      .setColor(0x2C3E50)
      .setThumbnail(guild.iconURL({ dynamic: true }))
      .setTimestamp();

    // Membros da Guilda
    if (membrosPorCargo['Membro'].length > 0) {
      const listaMembros = membrosPorCargo['Membro']
        .map((m, index) => `${index + 1}. ${m.status} **${m.nick}**`)
        .join('\n');

      embed.addFields({
        name: `👥 MEMBROS DA GUILDA (${membrosPorCargo['Membro'].length})`,
        value: listaMembros.substring(0, 1024) || 'Nenhum',
        inline: false
      });
    }

    // Aliança
    if (membrosPorCargo['Aliança'].length > 0) {
      const listaAlianca = membrosPorCargo['Aliança']
        .map((m, index) => `${index + 1}. ${m.status} **${m.nick}**`)
        .join('\n');

      embed.addFields({
        name: `🤝 ALIANÇA (${membrosPorCargo['Aliança'].length})`,
        value: listaAlianca.substring(0, 1024) || 'Nenhum',
        inline: false
      });
    }

    // Convidados
    if (membrosPorCargo['Convidado'].length > 0) {
      const listaConvidados = membrosPorCargo['Convidado']
        .map((m, index) => `${index + 1}. ${m.status} **${m.nick}**`)
        .join('\n');

      embed.addFields({
        name: `👋 CONVIDADOS (${membrosPorCargo['Convidado'].length})`,
        value: listaConvidados.substring(0, 1024) || 'Nenhum',
        inline: false
      });
    }

    // Estatísticas
    const onlineCount = Object.values(membrosPorCargo)
      .flat()
      .filter(m => m.status === '🟢').length;

    embed.addFields({
      name: '📊 ESTATÍSTICAS',
      value: `🟢 Online: ${onlineCount}\n⚫ Offline/Invisível: ${
        (membrosPorCargo['Membro'].length + 
         membrosPorCargo['Aliança'].length + 
         membrosPorCargo['Convidado'].length) - onlineCount
      }`,
      inline: false
    });

    return embed;
  }

  // Criar botões do painel
  static createRefreshButton() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_atualizar_lista_membros')
        .setLabel('🔄 Atualizar Lista')
        .setStyle(ButtonStyle.Primary)
    );
  }

  // Enviar painel no canal
  static async sendPanel(channel, guild) {
    try {
      const embed = await this.createMemberListEmbed(guild);
      const button = this.createRefreshButton();

      await channel.send({
        embeds: [embed],
        components: [button]
      });

      console.log(`✅ Painel de lista de membros enviado em ${channel.name}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar painel de membros:', error);
      return false;
    }
  }

  // Atualizar painel existente
  static async updatePanel(message, guild) {
    try {
      const embed = await this.createMemberListEmbed(guild);
      const button = this.createRefreshButton();

      await message.edit({
        embeds: [embed],
        components: [button]
      });
      return true;
    } catch (error) {
      console.error('❌ Erro ao atualizar painel de membros:', error);
      return false;
    }
  }
}

module.exports = MemberListPanel;