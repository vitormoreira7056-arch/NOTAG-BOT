const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  PermissionFlagsBits 
} = require('discord.js');

class RegistrationActions {
  // Verificar se usuário tem permissão para aprovar/recusar
  static hasApprovalPermission(member) {
    const allowedRoles = ['ADM', 'Staff', 'Recrutador'];
    return member.roles.cache.some(r => allowedRoles.includes(r.name)) ||
           member.permissions.has(PermissionFlagsBits.Administrator);
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

      // Buscar cargos
      const cargoMembro = guild.roles.cache.find(r => r.name === 'Membro');
      const cargoAlianca = guild.roles.cache.find(r => r.name === 'Aliança');
      const cargoConvidado = guild.roles.cache.find(r => r.name === 'Convidado');
      const cargoRemover = guild.roles.cache.find(r => r.name === 'Convidado'); // Remove Convidado se existir

      let cargoAdicionar;
      let corEmbed;

      switch(tipoCargo) {
        case 'Membro':
          cargoAdicionar = cargoMembro;
          corEmbed = 0x2ECC71; // Verde
          break;
        case 'Aliança':
          cargoAdicionar = cargoAlianca;
          corEmbed = 0xE67E22; // Laranja
          break;
        case 'Convidado':
          cargoAdicionar = cargoConvidado;
          corEmbed = 0x95A5A6; // Cinza
          break;
      }

      if (!cargoAdicionar) {
        return interaction.editReply({
          content: `❌ Cargo "${tipoCargo}" não encontrado no servidor!`,
          components: []
        });
      }

      // Aplicar cargos
      try {
        // Adicionar cargo novo
        await member.roles.add(cargoAdicionar);

        // Se for membro ou aliança, remover convidado (se tiver)
        if ((tipoCargo === 'Membro' || tipoCargo === 'Aliança') && cargoRemover) {
          if (member.roles.cache.has(cargoRemover.id)) {
            await member.roles.remove(cargoRemover);
          }
        }

        // Alterar nickname para o nick do jogo
        await member.setNickname(registro.nick).catch(err => {
          console.log('Não foi possível alterar nickname:', err.message);
        });

      } catch (roleError) {
        console.error('Erro ao aplicar cargos:', roleError);
      }

      // Atualizar mensagem original
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

      // Enviar DM para o usuário
      await this.sendApprovalDM(member, registro, tipoCargo);

      // Remover do registro pendente
      global.registrosPendentes.delete(registro.userId);

      // Log no canal de saída/membros se existir
      await this.logAction(guild, registro, `Aprovado como ${tipoCargo} por ${interaction.user.tag}`);

    } catch (error) {
      console.error('Erro ao processar aprovação:', error);
      await interaction.editReply({
        content: '❌ Erro ao processar aprovação.',
        components: []
      });
    }
  }

  // Recusar registro
  static async rejectRegistration(interaction, registroId) {
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

    try {
      await interaction.deferUpdate();

      const guild = interaction.guild;
      const member = await guild.members.fetch(registro.userId).catch(() => null);

      // Atualizar mensagem
      const embedRecusado = new EmbedBuilder()
        .setTitle('❌ Registro Recusado')
        .setDescription(`Registro recusado por ${interaction.user}`)
        .setColor(0xE74C3C)
        .addFields(
          { name: '👤 Usuário', value: `<@${registro.userId}>`, inline: true },
          { name: '🎮 Nick', value: registro.nick, inline: true }
        )
        .setTimestamp();

      await interaction.editReply({
        content: null,
        embeds: [embedRecusado],
        components: []
      });

      // Enviar DM
      if (member) {
        await this.sendRejectionDM(member, registro);
      }

      // Remover do pendente
      global.registrosPendentes.delete(registro.userId);

      // Log
      await this.logAction(guild, registro, `Recusado por ${interaction.user.tag}`);

    } catch (error) {
      console.error('Erro ao recusar:', error);
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

  // Enviar DM de recusa
  static async sendRejectionDM(member, registro) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('❌ Registro Recusado')
        .setDescription('Infelizmente seu registro foi recusado.')
        .setColor(0xE74C3C)
        .addFields(
          { name: '🎮 Nick Informado', value: registro.nick, inline: true },
          { name: '💡 Motivo', value: 'Entre em contato com a staff para mais informações.', inline: false }
        )
        .setFooter({ text: 'Tente novamente mais tarde ou fale com um Recrutador' })
        .setTimestamp();

      await member.send({ embeds: [embed] });
    } catch (error) {
      console.log('Não foi possível enviar DM de recusa:', error.message);
    }
  }

  // Log de ação
  static async logAction(guild, registro, acao) {
    const canalLog = guild.channels.cache.find(c => c.name === '🚪╠saída-membros');
    if (!canalLog) return;

    const embed = new EmbedBuilder()
      .setTitle('📝 Log de Registro')
      .setDescription(acao)
      .setColor(0x3498DB)
      .addFields(
        { name: 'Usuário', value: `<@${registro.userId}>`, inline: true },
        { name: 'Nick', value: registro.nick, inline: true }
      )
      .setTimestamp();

    await canalLog.send({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = RegistrationActions;