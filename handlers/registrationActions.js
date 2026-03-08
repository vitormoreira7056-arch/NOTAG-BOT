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

  static checkBlacklist(nick, userId) {
    try {
      if (global.blacklist && global.blacklist.has(userId)) {
        const data = global.blacklist.get(userId);
        return {
          isBlacklisted: true,
          reason: data.motivo || 'Banido do servidor'
        };
      }

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

  static getHistoricoRecusas(userId, nick) {
    try {
      if (!global.historicoRegistros || !global.historicoRegistros.has(userId)) {
        return [];
      }

      const historico = global.historicoRegistros.get(userId);
      return historico.filter(h => h.tipo === 'recusado' || h.status === 'recusado');
    } catch (error) {
      console.error('[RegistrationActions] Error getting historico:', error);
      return [];
    }
  }

  static async checkExistingRegistration(guild, userId, nick) {
    const erros = [];

    const membroExistente = await guild.members.fetch(userId).catch(() => null);
    if (membroExistente) {
      const roles = ['Membro', 'Aliança', 'Convidado'];
      const temCargo = membroExistente.roles.cache.some(r => roles.includes(r.name));
      if (temCargo) {
        erros.push('Você já está registrado neste servidor!');
      }
    }

    const membros = await guild.members.fetch();
    const nickExistente = membros.find(m =>
      m.nickname?.toLowerCase() === nick.toLowerCase() ||
      m.user.username.toLowerCase() === nick.toLowerCase()
    );

    if (nickExistente && nickExistente.id !== userId) {
      erros.push(`O nick "${nick}" já está em uso por outro jogador!`);
    }

    if (global.blacklist.has(userId)) {
      erros.push('Você está na blacklist e não pode se registrar!');
    }

    return erros;
  }

  // 🎯 FUNÇÃO AUXILIAR: Verificar permissão de recrutador/ADM
  static async checkRecruiterPermission(interaction) {
    const isRecrutador = interaction.member.roles.cache.some(r => r.name === 'Recrutador') ||
      interaction.member.roles.cache.some(r => r.name === 'ADM') ||
      interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isRecrutador) {
      await interaction.reply({
        content: '❌ Apenas Recrutadores ou ADMs podem aprovar registros!',
        ephemeral: true
      });
      return false;
    }
    return true;
  }

  static async approveAsMember(interaction, regId) {
    try {
      // 🎯 CORREÇÃO: Verificar permissão primeiro
      if (!(await this.checkRecruiterPermission(interaction))) return;

      console.log(`[Registration] Approving as member: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      // 🎯 CORREÇÃO: Extrair dados corretamente da estrutura aninhada
      const { userId, dados } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!membro) {
        return interaction.reply({
          content: '❌ Usuário não encontrado no servidor!',
          ephemeral: true
        });
      }

      const cargoMembro = interaction.guild.roles.cache.find(r => r.name === 'Membro');
      if (cargoMembro) {
        await membro.roles.add(cargoMembro);
      }

      await membro.setNickname(dados.nick);

      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'membro',
        dados: dados,
        aprovadoPor: interaction.user.id,
        data: Date.now()
      });

      global.registrosPendentes.delete(regId);

      const embedAprovacao = new EmbedBuilder()
        .setTitle('✅ REGISTRO APROVADO!')
        .setDescription(
          `🎉 **Parabéns!** Seu registro foi aprovado com sucesso!\n\n` +
          `\> **Nick:** \`${dados.nick}\`\n` +
          `\> **Guilda:** \`${dados.guilda}\`\n` +
          `\> **Plataforma:** \`${dados.platform}\`\n` +
          `\> **Arma:** \`${dados.arma}\`\n` +
          `\> **Cargo:** ⚔️ **Membro**\n` +
          `\> **Aprovado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚀 **Bem-vindo oficialmente à NOTAG!**\n` +
          `💰 Você agora tem acesso ao sistema financeiro e pode participar de eventos.`
        )
        .setColor(0x2ECC71)
        .setFooter({ text: 'NOTAG Bot • Sistema de Recrutamento' })
        .setTimestamp();

      try {
        await membro.send({ embeds: [embedAprovacao] });
      } catch (e) {
        console.log(`[Registration] Could not DM user ${userId}`);
      }

      await interaction.update({
        content: `✅ Registro aprovado! ${dados.nick} agora é Membro.`,
        components: []
      });

      console.log(`[Registration] Member approved: ${dados.nick}`);

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
      if (!(await this.checkRecruiterPermission(interaction))) return;

      console.log(`[Registration] Approving as alliance: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      const { userId, dados } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!membro) {
        return interaction.reply({
          content: '❌ Usuário não encontrado no servidor!',
          ephemeral: true
        });
      }

      const cargoAlianca = interaction.guild.roles.cache.find(r => r.name === 'Aliança');
      if (cargoAlianca) {
        await membro.roles.add(cargoAlianca);
      }

      await membro.setNickname(dados.nick);

      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'alianca',
        dados: dados,
        aprovadoPor: interaction.user.id,
        data: Date.now()
      });

      global.registrosPendentes.delete(regId);

      const embedAprovacao = new EmbedBuilder()
        .setTitle('✅ REGISTRO APROVADO!')
        .setDescription(
          `🎉 **Parabéns!** Seu registro foi aprovado como Aliança!\n\n` +
          `\> **Nick:** \`${dados.nick}\`\n` +
          `\> **Guilda:** \`${dados.guilda}\`\n` +
          `\> **Plataforma:** \`${dados.platform}\`\n` +
          `\> **Arma:** \`${dados.arma}\`\n` +
          `\> **Cargo:** 🤝 **Aliança**\n` +
          `\> **Aprovado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚀 **Bem-vindo à NOTAG como Aliança!**\n` +
          `💰 Você tem acesso limitado aos sistemas da guilda.`
        )
        .setColor(0xE67E22)
        .setFooter({ text: 'NOTAG Bot • Sistema de Recrutamento' })
        .setTimestamp();

      try {
        await membro.send({ embeds: [embedAprovacao] });
      } catch (e) {
        console.log(`[Registration] Could not DM user ${userId}`);
      }

      await interaction.update({
        content: `✅ Registro aprovado! ${dados.nick} agora é Aliança.`,
        components: []
      });

      console.log(`[Registration] Alliance approved: ${dados.nick}`);

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
      if (!(await this.checkRecruiterPermission(interaction))) return;

      console.log(`[Registration] Approving as guest: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado ou já processado!',
          ephemeral: true
        });
      }

      const { userId, dados } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!membro) {
        return interaction.reply({
          content: '❌ Usuário não encontrado no servidor!',
          ephemeral: true
        });
      }

      const cargoConvidado = interaction.guild.roles.cache.find(r => r.name === 'Convidado');
      if (cargoConvidado) {
        await membro.roles.add(cargoConvidado);
      }

      await membro.setNickname(dados.nick);

      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'convidado',
        dados: dados,
        aprovadoPor: interaction.user.id,
        data: Date.now()
      });

      global.registrosPendentes.delete(regId);

      const embedAprovacao = new EmbedBuilder()
        .setTitle('✅ REGISTRO APROVADO!')
        .setDescription(
          `🎉 **Parabéns!** Seu registro foi aprovado!\n\n` +
          `\> **Nick:** \`${dados.nick}\`\n` +
          `\> **Guilda:** \`${dados.guilda}\`\n` +
          `\> **Plataforma:** \`${dados.platform}\`\n` +
          `\> **Arma:** \`${dados.arma}\`\n` +
          `\> **Cargo:** 🎫 **Convidado**\n` +
          `\> **Aprovado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚀 **Bem-vindo à NOTAG como Convidado!**\n` +
          `⚠️ Seu acesso é temporário e limitado.`
        )
        .setColor(0x95A5A6)
        .setFooter({ text: 'NOTAG Bot • Sistema de Recrutamento' })
        .setTimestamp();

      try {
        await membro.send({ embeds: [embedAprovacao] });
      } catch (e) {
        console.log(`[Registration] Could not DM user ${userId}`);
      }

      await interaction.update({
        content: `✅ Registro aprovado! ${dados.nick} agora é Convidado.`,
        components: []
      });

      console.log(`[Registration] Guest approved: ${dados.nick}`);

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
      if (!(await this.checkRecruiterPermission(interaction))) return;

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

      const { userId, dados } = registro;
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!global.historicoRegistros.has(userId)) {
        global.historicoRegistros.set(userId, []);
      }
      global.historicoRegistros.get(userId).push({
        tipo: 'recusado',
        status: 'recusado',
        motivo: motivo,
        dados: dados,
        recusadoPor: interaction.user.id,
        data: Date.now()
      });

      global.registrosPendentes.delete(regId);

      const embedRecusa = new EmbedBuilder()
        .setTitle('❌ REGISTRO RECUSADO')
        .setDescription(
          `⚠️ **Seu registro foi recusado.**\n\n` +
          `\> **Nick:** \`${dados.nick}\`\n` +
          `\> **Motivo:** \`\`\`${motivo}\`\`\`\n` +
          `\> **Recusado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `💡 **O que fazer?**\n` +
          `• Verifique se suas informações estão corretas\n` +
          `• Entre em contato com um recrutador\n` +
          `• Tente se registrar novamente quando estiver pronto`
        )
        .setColor(0xE74C3C)
        .setFooter({ text: 'NOTAG Bot • Sistema de Recrutamento' })
        .setTimestamp();

      if (membro) {
        try {
          await membro.send({ embeds: [embedRecusa] });
        } catch (e) {
          console.log(`[Registration] Could not DM user ${userId}`);
        }
      }

      await interaction.reply({
        content: `❌ Registro de ${dados.nick} recusado. Motivo enviado no privado.`,
        ephemeral: true
      });

      try {
        await interaction.message?.edit({
          content: `❌ **REGISTRO RECUSADO**\n**Nick:** ${dados.nick}\n**Motivo:** ${motivo}\n**Por:** ${interaction.user.tag}`,
          components: []
        });
      } catch (e) {
        console.log('[Registration] Could not edit original message');
      }

      console.log(`[Registration] Registration rejected: ${dados.nick}`);

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
      if (!(await this.checkRecruiterPermission(interaction))) return;

      console.log(`[Registration] Adding to blacklist: ${regId}`);

      const registro = global.registrosPendentes.get(regId);
      if (!registro) {
        return interaction.reply({
          content: '❌ Registro não encontrado!',
          ephemeral: true
        });
      }

      const { userId, dados } = registro;

      global.blacklist.set(userId, {
        nick: dados.nick,
        guilda: dados.guilda,
        data: Date.now(),
        adicionadoPor: interaction.user.id
      });

      global.registrosPendentes.delete(regId);

      const embedBlacklist = new EmbedBuilder()
        .setTitle('🚫 BANIDO DO SERVIDOR')
        .setDescription(
          `⚠️ **Você foi adicionado à blacklist!**\n\n` +
          `\> **Nick:** \`${dados.nick}\`\n` +
          `\> **Guilda:** \`${dados.guilda}\`\n` +
          `\> **Adicionado por:** \`${interaction.user.tag}\`\n` +
          `\> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
          `🚫 **Você não pode mais se registrar neste servidor.**\n\n` +
          `💡 *Se você acredita que isso foi um erro, entre em contato com a administração.*`
        )
        .setColor(0x000000)
        .setFooter({ text: 'NOTAG Bot • Sistema de Segurança' })
        .setTimestamp();

      const membro = await interaction.guild.members.fetch(userId).catch(() => null);
      if (membro) {
        try {
          await membro.send({ embeds: [embedBlacklist] });
        } catch (e) {
          console.log(`[Registration] Could not DM user ${userId}`);
        }

        try {
          await membro.kick('Adicionado à blacklist');
        } catch (e) {
          console.log(`[Registration] Could not kick user ${userId}`);
        }
      }

      await interaction.update({
        content: `🚫 ${dados.nick} adicionado à blacklist e removido do servidor.`,
        components: []
      });

      const fs = require('fs');
      if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data', { recursive: true });
      }
      fs.writeFileSync('./data/blacklist.json', JSON.stringify([...global.blacklist], null, 2));

      console.log(`[Registration] User blacklisted: ${dados.nick}`);

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