const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

class RegistrationActions {
  static async initialize() {
    console.log('[RegistrationActions] Initialized');
  }

  /**
   * Verifica se um usuário ou nick está na blacklist
   * @param {string} nick - Nick do jogador
   * @param {string} userId - ID do usuário Discord
   * @returns {Object} - { isBlacklisted: boolean, reason: string }
   */
  static checkBlacklist(nick, userId) {
    try {
      // Verificar por userId
      if (global.blacklist && global.blacklist.has(userId)) {
        const data = global.blacklist.get(userId);
        return {
          isBlacklisted: true,
          reason: data.motivo || 'Banido do servidor'
        };
      }

      // Verificar por nick (case insensitive)
      if (global.blacklist) {
        for (const [id, data] of global.blacklist.entries()) {
          if (data.nick && data.nick.toLowerCase() === nick.toLowerCase()) {
            return {
              isBlacklisted: true,
              reason: data.motivo || 'Nick banido do servidor'
            };
          }
        }
      }

      return {
        isBlacklisted: false,
        reason: null
      };
    } catch (error) {
      console.error('[RegistrationActions] Error checking blacklist:', error);
      return {
        isBlacklisted: false,
        reason: null
      };
    }
  }

  /**
   * Retorna histórico de recusas de um usuário
   * @param {string} userId - ID do usuário
   * @param {string} nick - Nick do jogador (para verificação adicional)
   * @returns {Array} - Lista de recusas
   */
  static getHistoricoRecusas(userId, nick) {
    try {
      if (!global.historicoRegistros || !global.historicoRegistros.has(userId)) {
        return [];
      }

      const historico = global.historicoRegistros.get(userId);
      // Filtrar apenas recusas
      return historico.filter(h => h.tipo === 'recusado' || h.status === 'recusado');
    } catch (error) {
      console.error('[RegistrationActions] Error getting historico:', error);
      return [];
    }
  }

  static async checkExistingRegistration(guild, userId, nick) {
    const erros = [];

    // Verificar se usuário já está registrado
    const membroExistente = await guild.members.fetch(userId).catch(() => null);
    if (membroExistente) {
      const roles = ['Membro', 'Aliança', 'Convidado'];
      const temCargo = membroExistente.roles.cache.some(r => roles.includes(r.name));
      if (temCargo) {
        erros.push('Você já está registrado neste servidor!');
      }
    }

    // Verificar se nick já existe
    const membros = await guild.members.fetch();
    const nickExistente = membros.find(m =>
      m.nickname?.toLowerCase() === nick.toLowerCase() ||
      m.user.username.toLowerCase() === nick.toLowerCase()
    );

    if (nickExistente && nickExistente.id !== userId) {
      erros.push(`O nick "${nick}" já está em uso por outro jogador!`);
    }

    // Verificar blacklist
    if (global.blacklist.has(userId)) {
      erros.push('Você está na blacklist e não pode se registrar!');
    }

    return erros;
  }

  static async approveAsMember(interaction, regId) {
    try {
      console.log(`[Registration] Approving as member: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      // 🎯 CORREÇÃO: Acessar propriedades diretamente, não via dados
      const { userId, nick, guilda } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!membro) {
        return interaction.reply({
          content: '❌ Usuário não encontrado no servidor!',
          ephemeral: true
        });
      }

      // Atribuir cargo de Membro
      const cargoMembro = interaction.guild.roles.cache.find(r => r.name === 'Membro');
      if (cargoMembro) {
        await membro.roles.add(cargoMembro);
      }

      // Atualizar apelido para o nick do registro
      await membro.setNickname(nick);

      // Salvar no histórico
      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'membro',
        dados: registro, // Salvar todo o registro
        aprovadoPor: interaction.user.id,
        data: Date.now()
      });

      // Remover dos pendentes
      global.registrosPendentes.delete(regId);

      // DM - Aprovação como Membro (SEM IMAGENS)
      const embedAprovacao = new EmbedBuilder()
        .setTitle('✅ REGISTRO APROVADO!')
        .setDescription(
          `🎉 **Parabéns!** Seu registro foi aprovado com sucesso!\n\n` +
          `\> **Nick:** \`${nick}\`\n` +
          `\> **Guilda:** \`${guilda}\`\n` +
          `\> **Plataforma:** \`${registro.platform}\`\n` +
          `\> **Arma:** \`${registro.arma}\`\n` +
          `\> **Cargo:** ⚔️ **Membro**\n` +
          `\> **Aprovado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚀 **Bem-vindo oficialmente à NOTAG!**\n` +
          `💰 Você agora tem acesso ao sistema financeiro e pode participar de eventos.`
        )
        .setColor(0x2ECC71)
        .setFooter({
          text: 'NOTAG Bot • Sistema de Recrutamento'
        })
        .setTimestamp();

      try {
        await membro.send({ embeds: [embedAprovacao] });
      } catch (e) {
        console.log(`[Registration] Could not DM user ${userId}`);
      }

      // Atualizar mensagem original
      await interaction.update({
        content: `✅ Registro aprovado! ${nick} agora é Membro.`,
        components: []
      });

      console.log(`[Registration] Member approved: ${nick}`);

    } catch (error) {
      console.error(`[Registration] Error approving member:`, error);
      await interaction.reply({
        content: '❌ Erro ao aprovar registro.',
        ephemeral: true
      });
    }
  }

  static async approveAsAlianca(interaction, regId) {
    try {
      console.log(`[Registration] Approving as alliance: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      // 🎯 CORREÇÃO: Acessar propriedades diretamente
      const { userId, nick, guilda } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!membro) {
        return interaction.reply({
          content: '❌ Usuário não encontrado no servidor!',
          ephemeral: true
        });
      }

      // Atribuir cargo de Aliança
      const cargoAlianca = interaction.guild.roles.cache.find(r => r.name === 'Aliança');
      if (cargoAlianca) {
        await membro.roles.add(cargoAlianca);
      }

      // Atualizar apelido para o nick do registro
      await membro.setNickname(nick);

      // Salvar no histórico
      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'alianca',
        dados: registro,
        aprovadoPor: interaction.user.id,
        data: Date.now()
      });

      // Remover dos pendentes
      global.registrosPendentes.delete(regId);

      // DM - Aprovação como Aliança (SEM IMAGENS)
      const embedAprovacao = new EmbedBuilder()
        .setTitle('✅ REGISTRO APROVADO!')
        .setDescription(
          `🎉 **Parabéns!** Seu registro foi aprovado como Aliança!\n\n` +
          `\> **Nick:** \`${nick}\`\n` +
          `\> **Guilda:** \`${guilda}\`\n` +
          `\> **Plataforma:** \`${registro.platform}\`\n` +
          `\> **Arma:** \`${registro.arma}\`\n` +
          `\> **Cargo:** 🤝 **Aliança**\n` +
          `\> **Aprovado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚀 **Bem-vindo à NOTAG como Aliança!**\n` +
          `💰 Você tem acesso limitado aos sistemas da guilda.`
        )
        .setColor(0xE67E22)
        .setFooter({
          text: 'NOTAG Bot • Sistema de Recrutamento'
        })
        .setTimestamp();

      try {
        await membro.send({ embeds: [embedAprovacao] });
      } catch (e) {
        console.log(`[Registration] Could not DM user ${userId}`);
      }

      await interaction.update({
        content: `✅ Registro aprovado! ${nick} agora é Aliança.`,
        components: []
      });

      console.log(`[Registration] Alliance approved: ${nick}`);

    } catch (error) {
      console.error(`[Registration] Error approving alliance:`, error);
      await interaction.reply({
        content: '❌ Erro ao aprovar registro.',
        ephemeral: true
      });
    }
  }

  static async approveAsConvidado(interaction, regId) {
    try {
      console.log(`[Registration] Approving as guest: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      // 🎯 CORREÇÃO: Acessar propriedades diretamente
      const { userId, nick, guilda } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!membro) {
        return interaction.reply({
          content: '❌ Usuário não encontrado no servidor!',
          ephemeral: true
        });
      }

      // Atribuir cargo de Convidado
      const cargoConvidado = interaction.guild.roles.cache.find(r => r.name === 'Convidado');
      if (cargoConvidado) {
        await membro.roles.add(cargoConvidado);
      }

      // Atualizar apelido para o nick do registro
      await membro.setNickname(nick);

      // Salvar no histórico
      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'convidado',
        dados: registro,
        aprovadoPor: interaction.user.id,
        data: Date.now()
      });

      // Remover dos pendentes
      global.registrosPendentes.delete(regId);

      // DM - Aprovação como Convidado (SEM IMAGENS)
      const embedAprovacao = new EmbedBuilder()
        .setTitle('✅ REGISTRO APROVADO!')
        .setDescription(
          `🎉 **Parabéns!** Seu registro foi aprovado!\n\n` +
          `\> **Nick:** \`${nick}\`\n` +
          `\> **Guilda:** \`${guilda}\`\n` +
          `\> **Plataforma:** \`${registro.platform}\`\n` +
          `\> **Arma:** \`${registro.arma}\`\n` +
          `\> **Cargo:** 🎫 **Convidado**\n` +
          `\> **Aprovado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚀 **Bem-vindo à NOTAG como Convidado!**\n` +
          `⚠️ Seu acesso é temporário e limitado.`
        )
        .setColor(0x95A5A6)
        .setFooter({
          text: 'NOTAG Bot • Sistema de Recrutamento'
        })
        .setTimestamp();

      try {
        await membro.send({ embeds: [embedAprovacao] });
      } catch (e) {
        console.log(`[Registration] Could not DM user ${userId}`);
      }

      await interaction.update({
        content: `✅ Registro aprovado! ${nick} agora é Convidado.`,
        components: []
      });

      console.log(`[Registration] Guest approved: ${nick}`);

    } catch (error) {
      console.error(`[Registration] Error approving guest:`, error);
      await interaction.reply({
        content: '❌ Erro ao aprovar registro.',
        ephemeral: true
      });
    }
  }

  static async handleRejectRegistration(interaction, regId) {
    try {
      console.log(`[Registration] Showing rejection modal for: ${regId}`);

      const modal = {
        title: 'Recusar Registro',
        custom_id: `modal_recusar_registro_${regId}`,
        components: [{
          type: 1,
          components: [{
            type: 4,
            custom_id: 'motivo_recusa',
            label: 'Motivo da recusa',
            style: 2,
            placeholder: 'Explique o motivo da recusa...',
            required: true,
            max_length: 1000
          }]
        }]
      };

      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[Registration] Error showing rejection modal:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir modal de recusa.',
        ephemeral: true
      });
    }
  }

  static async processRejectionWithReason(interaction, regId) {
    try {
      const motivo = interaction.fields.getTextInputValue('motivo_recusa');
      const registro = global.registrosPendentes.get(regId);

      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado!',
          ephemeral: true
        });
      }

      // 🎯 CORREÇÃO: Acessar propriedades diretamente do registro
      const { userId, nick, guilda } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      // Salvar no histórico como recusado
      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'recusado',
        status: 'recusado',
        motivo: motivo,
        dados: registro,
        recusadoPor: interaction.user.id,
        data: Date.now()
      });

      // Remover dos pendentes
      global.registrosPendentes.delete(regId);

      // DM - Registro Recusado (SEM IMAGENS)
      const embedRecusa = new EmbedBuilder()
        .setTitle('❌ REGISTRO RECUSADO')
        .setDescription(
          `⚠️ **Seu registro foi recusado.**\n\n` +
          `\> **Nick:** \`${nick}\`\n` +
          `\> **Motivo:** \`\`\`${motivo}\`\`\`\n` +
          `\> **Recusado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `💡 **O que fazer?**\n` +
          `• Verifique se suas informações estão corretas\n` +
          `• Entre em contato com um recrutador\n` +
          `• Tente se registrar novamente quando estiver pronto`
        )
        .setColor(0xE74C3C)
        .setFooter({
          text: 'NOTAG Bot • Sistema de Recrutamento'
        })
        .setTimestamp();

      if (membro) {
        try {
          await membro.send({ embeds: [embedRecusa] });
        } catch (e) {
          console.log(`[Registration] Could not DM user ${userId}`);
        }
      }

      await interaction.reply({
        content: `❌ Registro de ${nick} recusado. Motivo enviado no privado.`,
        ephemeral: true
      });

      // Atualizar mensagem original se possível
      try {
        await interaction.message?.edit({
          content: `❌ **REGISTRO RECUSADO**\n**Nick:** ${nick}\n**Motivo:** ${motivo}\n**Por:** ${interaction.user.tag}`,
          components: []
        });
      } catch (e) {
        console.log('[Registration] Could not edit original message');
      }

      console.log(`[Registration] Registration rejected: ${nick}`);

    } catch (error) {
      console.error(`[Registration] Error processing rejection:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar recusa.',
        ephemeral: true
      });
    }
  }

  static async handleBlacklistAdd(interaction, regId) {
    try {
      console.log(`[Registration] Adding to blacklist: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado!',
          ephemeral: true
        });
      }

      // 🎯 CORREÇÃO: Acessar propriedades diretamente
      const { userId, nick, guilda } = registro;

      // Adicionar à blacklist
      global.blacklist.set(userId, {
        nick: nick,
        guilda: guilda,
        data: Date.now(),
        adicionadoPor: interaction.user.id
      });

      // Remover dos pendentes
      global.registrosPendentes.delete(regId);

      // DM - Adicionado à Blacklist (SEM IMAGENS)
      const embedBlacklist = new EmbedBuilder()
        .setTitle('🚫 BANIDO DO SERVIDOR')
        .setDescription(
          `⚠️ **Você foi adicionado à blacklist!**\n\n` +
          `\> **Nick:** \`${nick}\`\n` +
          `\> **Guilda:** \`${guilda}\`\n` +
          `\> **Adicionado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚫 **Você não pode mais se registrar neste servidor.**\n\n` +
          `💡 *Se você acredita que isso foi um erro, entre em contato com a administração.*`
        )
        .setColor(0x000000)
        .setFooter({
          text: 'NOTAG Bot • Sistema de Segurança'
        })
        .setTimestamp();

      const membro = await interaction.guild.members.fetch(userId).catch(() => null);
      if (membro) {
        try {
          await membro.send({ embeds: [embedBlacklist] });
        } catch (e) {
          console.log(`[Registration] Could not DM user ${userId}`);
        }

        // Kick do servidor
        try {
          await membro.kick('Adicionado à blacklist');
        } catch (e) {
          console.log(`[Registration] Could not kick user ${userId}`);
        }
      }

      await interaction.update({
        content: `🚫 ${nick} adicionado à blacklist e removido do servidor.`,
        components: []
      });

      // Salvar blacklist
      const fs = require('fs');
      if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data', { recursive: true });
      }
      fs.writeFileSync('./data/blacklist.json', JSON.stringify([...global.blacklist], null, 2));

      console.log(`[Registration] User blacklisted: ${nick}`);

    } catch (error) {
      console.error(`[Registration] Error adding to blacklist:`, error);
      await interaction.reply({
        content: '❌ Erro ao adicionar à blacklist.',
        ephemeral: true
      });
    }
  }

  static async processBlacklistAdd(interaction, regId) {
    try {
      const motivo = interaction.fields.getTextInputValue('motivo_blacklist');

      // Atualizar dados da blacklist com motivo
      const registro = global.registrosPendentes.get(regId);
      if (registro && global.blacklist.has(registro.userId)) {
        const data = global.blacklist.get(registro.userId);
        data.motivo = motivo;
        global.blacklist.set(registro.userId, data);
      }

      await this.handleBlacklistAdd(interaction, regId);
    } catch (error) {
      console.error(`[Registration] Error processing blacklist add:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar blacklist.',
        ephemeral: true
      });
    }
  }
}

module.exports = RegistrationActions;