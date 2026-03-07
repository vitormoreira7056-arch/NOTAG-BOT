const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

class RegistrationActions {
  // Inicializar estruturas globais se não existirem
  static initialize() {
    if (!global.registrosPendentes) global.registrosPendentes = new Map();
    if (!global.registroTemp) global.registroTemp = new Map();
    if (!global.blacklist) global.blacklist = new Map(); // nick -> {motivo, data, staff}
    if (!global.historicoRegistros) global.historicoRegistros = new Map(); // userId -> [{nick, status, motivo, data}]

    // Iniciar auto-update do painel a cada 1 hora
    this.startAutoUpdatePanel();
  }

  // Iniciar atualização automática a cada 1 hora
  static startAutoUpdatePanel() {
    console.log('⏰ Iniciando auto-update do painel de membros (1h)');

    // Atualizar imediatamente ao iniciar
    setInterval(async () => {
      try {
        // Verificar se client está disponível
        if (!global.client) return;

        // Para cada guilda que o bot está
        for (const guild of global.client.guilds.cache.values()) {
          await this.updateMemberListPanel(guild);
        }
        console.log(`🔄 Painel de membros atualizado automaticamente (${new Date().toLocaleTimeString()})`);
      } catch (error) {
        console.error('Erro no auto-update do painel:', error);
      }
    }, 60 * 60 * 1000); // 1 hora em ms
  }

  // Verificar blacklist
  static checkBlacklist(nick, userId) {
    if (!global.blacklist) return { isBlacklisted: false };

    const nickLower = nick.toLowerCase();

    // Verificar por nick
    if (global.blacklist.has(nickLower)) {
      return {
        isBlacklisted: true,
        reason: global.blacklist.get(nickLower).motivo,
        type: 'nick'
      };
    }

    return { isBlacklisted: false };
  }

  // Adicionar à blacklist
  static async addToBlacklist(nick, motivo, staffId) {
    if (!global.blacklist) global.blacklist = new Map();

    global.blacklist.set(nick.toLowerCase(), {
      nick: nick,
      motivo: motivo,
      data: Date.now(),
      staffId: staffId
    });

    console.log(`🚫 Nick "${nick}" adicionado à blacklist por ${staffId}`);
  }

  // Obter histórico de recusas
  static getHistoricoRecusas(userId, nick) {
    if (!global.historicoRegistros) return [];

    const historico = global.historicoRegistros.get(userId) || [];

    // Filtrar apenas recusas deste nick específico
    return historico.filter(h => 
      h.nick.toLowerCase() === nick.toLowerCase() && h.status === 'recusado'
    );
  }

  // Adicionar ao histórico
  static addToHistory(userId, nick, status, motivo = null, staffId = null) {
    if (!global.historicoRegistros) global.historicoRegistros = new Map();

    if (!global.historicoRegistros.has(userId)) {
      global.historicoRegistros.set(userId, []);
    }

    global.historicoRegistros.get(userId).push({
      nick: nick,
      status: status, // 'aprovado' ou 'recusado'
      motivo: motivo,
      staffId: staffId,
      data: Date.now()
    });
  }

  // Verificar se usuário tem permissão para aprovar/recusar
  static hasApprovalPermission(member) {
    const allowedRoles = ['ADM', 'Staff', 'Recrutador'];
    return member.roles.cache.some(r => allowedRoles.includes(r.name)) ||
      member.permissions.has(PermissionFlagsBits.Administrator);
  }

  // Verificar se usuário já tem registro pendente ou é membro
  static async checkExistingRegistration(guild, userId, nick) {
    const errors = [];

    // Verificar registro pendente
    if (global.registrosPendentes?.has(userId)) {
      errors.push('Você já tem um registro pendente de análise.');
    }

    // Verificar blacklist
    const blacklistCheck = this.checkBlacklist(nick, userId);
    if (blacklistCheck.isBlacklisted) {
      errors.push(`🚫 Este nick está na blacklist. Motivo: ${blacklistCheck.reason}`);
    }

    try {
      const member = await guild.members.fetch(userId);
      const cargosMembro = ['Membro', 'Aliança', 'Convidado'];
      const temCargo = member.roles.cache.some(r => cargosMembro.includes(r.name));

      if (temCargo) {
        errors.push('Você já está registrado neste servidor.');
      }

      for (const [uid, registro] of global.registrosPendentes.entries()) {
        if (registro.nick.toLowerCase() === nick.toLowerCase() && uid !== userId) {
          errors.push(`O nick "${nick}" já está em processo de registro por outro usuário.`);
          break;
        }
      }

      const membros = await guild.members.fetch();
      const membroComMesmoNick = membros.find(m =>
        m.nickname && m.nickname.toLowerCase() === nick.toLowerCase()
      );

      if (membroComMesmoNick && membroComMesmoNick.id !== userId) {
        errors.push(`O nick "${nick}" já está sendo usado por outro membro do Discord.`);
      }

    } catch (error) {
      console.error('Erro ao verificar registro existente:', error);
    }

    return errors;
  }

  // Aprovar como Membro
  static async approveAsMember(interaction, registroId) {
    if (!this.hasApprovalPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para aprovar registros!',
        ephemeral: true
      });
    }

    const registro = this.findRegistroById(registroId);
    if (!registro) {
      return interaction.reply({
        content: '❌ Registro não encontrado ou já processado!',
        ephemeral: true
      });
    }

    await this.processApproval(interaction, registro, 'Membro');
  }

  // Aprovar como Aliança
  static async approveAsAlianca(interaction, registroId) {
    if (!this.hasApprovalPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para aprovar registros!',
        ephemeral: true
      });
    }

    const registro = this.findRegistroById(registroId);
    if (!registro) {
      return interaction.reply({
        content: '❌ Registro não encontrado ou já processado!',
        ephemeral: true
      });
    }

    await this.processApproval(interaction, registro, 'Aliança');
  }

  // Aprovar como Convidado
  static async approveAsConvidado(interaction, registroId) {
    if (!this.hasApprovalPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para aprovar registros!',
        ephemeral: true
      });
    }

    const registro = this.findRegistroById(registroId);
    if (!registro) {
      return interaction.reply({
        content: '❌ Registro não encontrado ou já processado!',
        ephemeral: true
      });
    }

    await this.processApproval(interaction, registro, 'Convidado');
  }

  // Processar aprovação genérica
  static async processApproval(interaction, registro, tipoCargo) {
    try {
      await interaction.deferUpdate();

      const guild = interaction.guild;
      const member = await guild.members.fetch(registro.userId).catch(() => null);

      if (!member) {
        return interaction.editReply({
          content: '❌ Membro não encontrado no servidor!',
          components: []
        });
      }

      const cargoMembro = guild.roles.cache.find(r => r.name === 'Membro');
      const cargoAlianca = guild.roles.cache.find(r => r.name === 'Aliança');
      const cargoConvidado = guild.roles.cache.find(r => r.name === 'Convidado');
      const cargoRemover = guild.roles.cache.find(r => r.name === 'Convidado');

      let cargoAdicionar;
      let corEmbed;

      switch (tipoCargo) {
        case 'Membro':
          cargoAdicionar = cargoMembro;
          corEmbed = 0x2ECC71;
          break;
        case 'Aliança':
          cargoAdicionar = cargoAlianca;
          corEmbed = 0xE67E22;
          break;
        case 'Convidado':
          cargoAdicionar = cargoConvidado;
          corEmbed = 0x95A5A6;
          break;
      }

      if (!cargoAdicionar) {
        return interaction.editReply({
          content: `❌ Cargo "${tipoCargo}" não encontrado no servidor!`,
          components: []
        });
      }

      try {
        await member.roles.add(cargoAdicionar);

        if ((tipoCargo === 'Membro' || tipoCargo === 'Aliança') && cargoRemover) {
          if (member.roles.cache.has(cargoRemover.id)) {
            await member.roles.remove(cargoRemover);
          }
        }

        await member.setNickname(registro.nick).catch(err => {
          console.log('Não foi possível alterar nickname:', err.message);
        });

      } catch (roleError) {
        console.error('Erro ao aplicar cargos:', roleError);
      }

      // Adicionar ao histórico
      this.addToHistory(registro.userId, registro.nick, 'aprovado', null, interaction.user.id);

      const embedAprovado = new EmbedBuilder()
        .setTitle(`✅ Registro Aprovado - ${tipoCargo}`)
        .setDescription(`Registro aprovado por ${interaction.user}`)
        .setColor(corEmbed)
        .addFields(
          { name: '👤 Usuário', value: `<@${registro.userId}>`, inline: true },
          { name: '🎮 Nick', value: registro.nick, inline: true },
          { name: '🏷️ Tipo', value: tipoCargo, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({
        content: null,
        embeds: [embedAprovado],
        components: []
      });

      await this.sendApprovalDM(member, registro, tipoCargo);
      global.registrosPendentes.delete(registro.userId);

      // Atualizar painel imediatamente
      await this.updateMemberListPanel(guild);

    } catch (error) {
      console.error('Erro ao processar aprovação:', error);
      await interaction.editReply({
        content: '❌ Erro ao processar aprovação.',
        components: []
      });
    }
  }

  // Handler para adicionar à blacklist (novo botão)
  static async handleBlacklistAdd(interaction, registroId) {
    if (!this.hasApprovalPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ Sem permissão!',
        ephemeral: true
      });
    }

    const registro = this.findRegistroById(registroId);
    if (!registro) {
      return interaction.reply({
        content: '❌ Registro não encontrado!',
        ephemeral: true
      });
    }

    // Criar modal para motivo da blacklist
    const modal = new ModalBuilder()
      .setCustomId(`modal_blacklist_${registroId}`)
      .setTitle('🚫 Adicionar à Blacklist');

    const motivoInput = new TextInputBuilder()
      .setCustomId('motivo_blacklist')
      .setLabel('Motivo do banimento permanente')
      .setPlaceholder('Ex: Tentativa de registro com nick falso múltiplas vezes')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(500);

    const row = new ActionRowBuilder().addComponents(motivoInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // Processar adição à blacklist
  static async processBlacklistAdd(interaction, registroId) {
    try {
      const motivo = interaction.fields.getTextInputValue('motivo_blacklist').trim();
      const registro = this.findRegistroById(registroId);

      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado!',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      // Adicionar à blacklist
      await this.addToBlacklist(registro.nick, motivo, interaction.user.id);

      // Atualizar mensagem original
      const embedBlacklist = new EmbedBuilder()
        .setTitle('🚫 Jogador Blacklistado')
        .setDescription(`Nick banido permanentemente por ${interaction.user}`)
        .setColor(0x000000)
        .addFields(
          { name: '👤 Usuário', value: `<@${registro.userId}>`, inline: true },
          { name: '🎮 Nick Banido', value: registro.nick, inline: true },
          { name: '📝 Motivo', value: motivo, inline: false }
        )
        .setTimestamp();

      const channel = interaction.channel;
      const message = await channel.messages.fetch(registro.messageId).catch(() => null);

      if (message) {
        await message.edit({
          content: '🚫 **BLACKLIST**',
          embeds: [embedBlacklist],
          components: []
        });
      }

      // Notificar usuário
      const member = await interaction.guild.members.fetch(registro.userId).catch(() => null);
      if (member) {
        try {
          await member.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('🚫 Registro Bloqueado Permanentemente')
                .setDescription(`Seu nick "${registro.nick}" foi adicionado à blacklist.\n\nMotivo: ${motivo}\n\nEntre em contato com a staff se acredita que houve um erro.`)
                .setColor(0x000000)
                .setTimestamp()
            ]
          });
        } catch (e) {
          console.log('Não foi possível enviar DM de blacklist');
        }
      }

      // Adicionar ao histórico como recusado
      this.addToHistory(registro.userId, registro.nick, 'recusado', `BLACKLIST: ${motivo}`, interaction.user.id);

      global.registrosPendentes.delete(registro.userId);

      await interaction.editReply({
        content: `✅ ${registro.nick} adicionado à blacklist com sucesso.`
      });

    } catch (error) {
      console.error('Erro ao processar blacklist:', error);
      await interaction.editReply({
        content: '❌ Erro ao processar blacklist.'
      });
    }
  }

  // Criar modal de recusa com motivo
  static async handleRejectRegistration(interaction, registroId) {
    if (!this.hasApprovalPermission(interaction.member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para recusar registros!',
        ephemeral: true
      });
    }

    const registro = this.findRegistroById(registroId);
    if (!registro) {
      return interaction.reply({
        content: '❌ Registro não encontrado ou já processado!',
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_recusar_registro_${registroId}`)
      .setTitle('❌ Recusar Registro');

    const motivoInput = new TextInputBuilder()
      .setCustomId('motivo_recusa')
      .setLabel('Informe o motivo da recusa')
      .setPlaceholder('Ex: Nick incorreto, Guilda não encontrada, etc.')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(500);

    const row = new ActionRowBuilder().addComponents(motivoInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
  }

  // Processar recusa com motivo
  static async processRejectionWithReason(interaction, registroId) {
    try {
      const motivo = interaction.fields.getTextInputValue('motivo_recusa').trim();
      const registro = this.findRegistroById(registroId);

      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const guild = interaction.guild;
      const member = await guild.members.fetch(registro.userId).catch(() => null);

      // Adicionar ao histórico de recusas
      this.addToHistory(registro.userId, registro.nick, 'recusado', motivo, interaction.user.id);

      const embedRecusado = new EmbedBuilder()
        .setTitle('❌ Registro Recusado')
        .setDescription(`Registro recusado por ${interaction.user}`)
        .setColor(0xE74C3C)
        .addFields(
          { name: '👤 Usuário', value: `<@${registro.userId}>`, inline: true },
          { name: '🎮 Nick', value: registro.nick, inline: true },
          { name: '📝 Motivo', value: motivo, inline: false }
        )
        .setTimestamp();

      const channel = interaction.channel;
      const message = await channel.messages.fetch(registro.messageId).catch(() => null);

      if (message) {
        await message.edit({
          content: null,
          embeds: [embedRecusado],
          components: []
        });
      }

      await interaction.editReply({
        content: '✅ Registro recusado com sucesso.'
      });

      if (member) {
        await this.sendRejectionDM(member, registro, motivo);
      }

      global.registrosPendentes.delete(registro.userId);

      // Atualizar painel imediatamente
      await this.updateMemberListPanel(guild);

    } catch (error) {
      console.error('Erro ao recusar:', error);
      await interaction.editReply({
        content: '❌ Erro ao processar recusa.'
      });
    }
  }

  // Encontrar registro pelo ID
  static findRegistroById(registroId) {
    if (!global.registrosPendentes) return null;

    for (const [userId, registro] of global.registrosPendentes.entries()) {
      if (registro.id === registroId) {
        return registro;
      }
    }
    return null;
  }

  // Enviar DM de aprovação
  static async sendApprovalDM(member, registro, tipo) {
    try {
      const embed = new EmbedBuilder()
        .setTitle(`✅ Registro Aprovado!`)
        .setDescription(`Parabéns! Seu registro foi aprovado como **${tipo}**!`)
        .setColor(0x2ECC71)
        .addFields(
          { name: '🎮 Nick Registrado', value: registro.nick, inline: true },
          { name: '🏷️ Tipo de Acesso', value: tipo, inline: true },
          { name: '💻 Plataforma', value: registro.platform, inline: true }
        )
        .setFooter({ text: 'Bem-vindo à guilda!' })
        .setTimestamp();

      await member.send({ embeds: [embed] });
    } catch (error) {
      console.log('Não foi possível enviar DM de aprovação:', error.message);
    }
  }

  // Enviar DM de recusa com motivo
  static async sendRejectionDM(member, registro, motivo) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('❌ Registro Recusado')
        .setDescription('Infelizmente seu registro foi recusado.')
        .setColor(0xE74C3C)
        .addFields(
          { name: '🎮 Nick Informado', value: registro.nick, inline: true },
          { name: '📝 Motivo da Recusa', value: motivo, inline: false },
          { name: '💡 O que fazer?', value: 'Entre em contato com a staff se tiver dúvidas ou tente se registrar novamente com os dados corretos.', inline: false }
        )
        .setFooter({ text: 'Tente novamente quando estiver correto' })
        .setTimestamp();

      await member.send({ embeds: [embed] });
    } catch (error) {
      console.log('Não foi possível enviar DM de recusa:', error.message);
    }
  }

  // Atualizar painel de lista de membros
  static async updateMemberListPanel(guild) {
    try {
      const MemberListPanel = require('./memberListPanel');
      const channel = guild.channels.cache.find(c => c.name === '📋╠lista-membros');
      if (!channel) return;

      const messages = await channel.messages.fetch({ limit: 10 });
      const painel = messages.find(m =>
        m.author.bot &&
        m.embeds.length > 0 &&
        m.embeds[0].title?.includes('LISTA DE MEMBROS')
      );

      if (painel) {
        await MemberListPanel.updatePanel(painel, guild);
      } else {
        await MemberListPanel.sendPanel(channel, guild);
      }
    } catch (error) {
      console.error('Erro ao atualizar lista de membros:', error);
    }
  }
}

module.exports = RegistrationActions;