const { 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const AlbionAPI = require('./albionApi');

class RegistrationModal {
  static createRegistrationModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_registro')
      .setTitle('📝 Registro de Novo Membro');

    const nickInput = new TextInputBuilder()
      .setCustomId('reg_nick')
      .setLabel('🎮 Seu Nick no Albion Online')
      .setPlaceholder('Ex: TTV_SeuNome')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(32)
      .setMinLength(2);

    const guildaInput = new TextInputBuilder()
      .setCustomId('reg_guilda')
      .setLabel('🏰 Guilda Atual (ou "Nenhuma")')
      .setPlaceholder('Ex: MinhaGuilda ou Nenhuma')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const armaInput = new TextInputBuilder()
      .setCustomId('reg_arma')
      .setLabel('⚔️ Arma Principal / Spec')
      .setPlaceholder('Ex: Arco 700/700, Frost 600/700, Fire 800/800+...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(200);

    const row1 = new ActionRowBuilder().addComponents(nickInput);
    const row2 = new ActionRowBuilder().addComponents(guildaInput);
    const row3 = new ActionRowBuilder().addComponents(armaInput);

    modal.addComponents(row1, row2, row3);
    return modal;
  }

  static createServerSelectMenu() {
    const select = new StringSelectMenuBuilder()
      .setCustomId('select_server_registro')
      .setPlaceholder('🌍 Selecione seu servidor')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Américas')
          .setDescription('Servidor Americas (US)')
          .setValue('americas')
          .setEmoji('🌎'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Europa')
          .setDescription('Servidor Europe (EU)')
          .setValue('europe')
          .setEmoji('🌍'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Ásia')
          .setDescription('Servidor Asia')
          .setValue('asia')
          .setEmoji('🌏')
      );

    return new ActionRowBuilder().addComponents(select);
  }

  static createPlatformSelectMenu() {
    const select = new StringSelectMenuBuilder()
      .setCustomId('select_platform_registro')
      .setPlaceholder('💻 Selecione sua plataforma')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('PC (Steam/Cliente)')
          .setDescription('Joga no computador')
          .setValue('PC')
          .setEmoji('💻'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Mobile')
          .setDescription('Joga no celular/tablet')
          .setValue('Mobile')
          .setEmoji('📱'),
        new StringSelectMenuOptionBuilder()
          .setLabel('PC e Mobile')
          .setDescription('Joga em ambas as plataformas')
          .setValue('PC e Mobile')
          .setEmoji('🖥️')
      );

    return new ActionRowBuilder().addComponents(select);
  }

  static async processRegistration(interaction, client) {
    try {
      await interaction.deferReply({ ephemeral: true });

      const nick = interaction.fields.getTextInputValue('reg_nick').trim();
      const guilda = interaction.fields.getTextInputValue('reg_guilda').trim();
      const arma = interaction.fields.getTextInputValue('reg_arma').trim();

      if (global.registrosPendentes?.has(interaction.user.id)) {
        return await interaction.editReply({
          content: '❌ Você já tem um registro pendente! Aguarde a análise da staff.'
        });
      }

      if (!global.registroTemp) global.registroTemp = new Map();

      global.registroTemp.set(interaction.user.id, {
        nick,
        guilda,
        arma,
        etapa: 'selecionar_servidor'
      });

      const embed = new EmbedBuilder()
        .setTitle('🌍 Selecione seu Servidor')
        .setDescription('Por favor, selecione o servidor onde você joga Albion Online:')
        .setColor(0x3498DB)
        .setFooter({ text: 'Etapa 1/2 • Dados do Registro' });

      await interaction.editReply({
        embeds: [embed],
        components: [this.createServerSelectMenu()]
      });

    } catch (error) {
      console.error('Erro ao processar modal:', error);
      await interaction.editReply({
        content: '❌ Erro ao processar registro. Tente novamente.'
      });
    }
  }

  static async processServerSelect(interaction) {
    try {
      await interaction.deferUpdate(); // Adicionar deferUpdate para evitar timeout

      const server = interaction.values[0];
      const tempData = global.registroTemp?.get(interaction.user.id);

      if (!tempData) {
        return await interaction.editReply({
          content: '❌ Sessão expirada. Por favor, inicie o registro novamente.',
          components: [],
          embeds: []
        });
      }

      tempData.server = server;
      tempData.etapa = 'selecionar_plataforma';
      global.registroTemp.set(interaction.user.id, tempData);

      const serverNames = {
        'americas': '🌎 Américas',
        'europe': '🌍 Europa',
        'asia': '🌏 Ásia'
      };

      const embed = new EmbedBuilder()
        .setTitle('💻 Selecione sua Plataforma')
        .setDescription(`Servidor selecionado: ${serverNames[server]}\n\nAgora selecione em qual plataforma você joga:`)
        .setColor(0x3498DB)
        .setFooter({ text: 'Etapa 2/2 • Dados do Registro' });

      await interaction.editReply({
        embeds: [embed],
        components: [this.createPlatformSelectMenu()]
      });

    } catch (error) {
      console.error('Erro em processServerSelect:', error);
      // Tentar responder se ainda for possível
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ Erro ao processar seleção. Tente novamente.',
            ephemeral: true
          });
        }
      } catch (e) {}
    }
  }

  static async processPlatformSelect(interaction, client) {
    try {
      await interaction.deferUpdate(); // Adicionar deferUpdate para evitar timeout

      const platform = interaction.values[0];
      const tempData = global.registroTemp?.get(interaction.user.id);

      if (!tempData) {
        return await interaction.editReply({
          content: '❌ Sessão expirada. Por favor, inicie o registro novamente.',
          components: [],
          embeds: []
        });
      }

      await interaction.editReply({
        content: '⏳ Validando dados na API do Albion Online... Isso pode levar alguns segundos.',
        components: [],
        embeds: []
      });

      tempData.platform = platform;
      const { nick, guilda, arma, server } = tempData;

      try {
        const verification = await AlbionAPI.verifyPlayerGuild(nick, guilda, server);

        if (!verification.valid) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Validação Falhou')
            .setDescription(verification.error)
            .addFields(
              { name: '🎮 Nick Informado', value: nick, inline: true },
              { name: '🏰 Guilda Informada', value: guilda, inline: true },
              { name: '🌍 Servidor', value: server, inline: true }
            )
            .setColor(0xE74C3C)
            .setFooter({ text: 'Verifique os dados e tente novamente' });

          global.registroTemp.delete(interaction.user.id);

          return await interaction.editReply({
            content: null,
            embeds: [errorEmbed],
            components: [
              new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                  .setCustomId('btn_tentar_novamente_registro')
                  .setLabel('🔄 Tentar Novamente')
                  .setStyle(ButtonStyle.Primary)
              )
            ]
          });
        }

        const registroId = `reg_${Date.now()}_${interaction.user.id}`;
        const registroData = {
          id: registroId,
          userId: interaction.user.id,
          userTag: interaction.user.tag,
          nick: nick,
          nickDoJogo: nick,
          guilda: guilda,
          server: server,
          platform: platform,
          arma: arma,
          albionData: verification.details,
          status: 'pendente',
          timestamp: Date.now()
        };

        if (!global.registrosPendentes) global.registrosPendentes = new Map();
        global.registrosPendentes.set(interaction.user.id, registroData);

        global.registroTemp.delete(interaction.user.id);

        await this.sendToApprovalChannel(interaction, registroData, client);

        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Registro Enviado!')
          .setDescription('Seu registro foi validado e enviado para análise da staff!')
          .addFields(
            { name: '🎮 Nick', value: nick, inline: true },
            { name: '🏰 Guilda', value: guilda || 'Nenhuma', inline: true },
            { name: '🌍 Servidor', value: server, inline: true },
            { name: '💻 Plataforma', value: platform, inline: true },
            { name: '⚔️ Arma/Spec', value: arma, inline: false }
          )
          .setColor(0x2ECC71)
          .setFooter({ text: 'Você receberá uma DM quando for analisado' });

        await interaction.editReply({
          content: null,
          embeds: [successEmbed],
          components: []
        });

      } catch (error) {
        console.error('Erro na validação:', error);
        await interaction.editReply({
          content: '❌ Erro ao validar dados na API do Albion. Tente novamente mais tarde.',
          components: [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('btn_tentar_novamente_registro')
                .setLabel('🔄 Tentar Novamente')
                .setStyle(ButtonStyle.Primary)
            )
          ],
          embeds: []
        });
      }

    } catch (error) {
      console.error('Erro em processPlatformSelect:', error);
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ Erro ao processar seleção. Tente novamente.',
            ephemeral: true
          });
        }
      } catch (e) {}
    }
  }

  static async sendToApprovalChannel(interaction, registroData, client) {
    try {
      const guild = interaction.guild;
      const canalSolicitacao = guild.channels.cache.find(
        c => c.name === '📨╠solicitação-registro'
      );

      if (!canalSolicitacao) {
        throw new Error('Canal de solicitação de registro não encontrado!');
      }

      const serverEmoji = {
        'americas': '🌎',
        'europe': '🌍',
        'asia': '🌏'
      };

      const embed = new EmbedBuilder()
        .setTitle('📝 Nova Solicitação de Registro')
        .setDescription(`Registro de ${interaction.user}`)
        .setColor(0xF39C12)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Usuário Discord', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: false },
          { name: '🎮 Nick no Albion', value: `\`${registroData.nick}\``, inline: true },
          { name: '🏰 Guilda Atual', value: registroData.guilda || 'Nenhuma', inline: true },
          { name: '🌍 Servidor', value: `${serverEmoji[registroData.server]} ${registroData.server.toUpperCase()}`, inline: true },
          { name: '💻 Plataforma', value: registroData.platform, inline: true },
          { name: '⚔️ Arma/Spec', value: registroData.arma, inline: false }
        )
        .setFooter({ text: `ID do Registro: ${registroData.id}` })
        .setTimestamp();

      if (registroData.albionData) {
        embed.addFields({
          name: '✅ Validação API',
          value: `Jogador verificado na API do Albion\nGuilda atual: ${registroData.albionData.guildName || 'Sem guilda'}`,
          inline: false
        });
      }

      const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`aprovar_membro_${registroData.id}`)
          .setLabel('✅ Membro')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`aprovar_alianca_${registroData.id}`)
          .setLabel('🤝 Aliança')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`aprovar_convidado_${registroData.id}`)
          .setLabel('👋 Convidado')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`recusar_registro_${registroData.id}`)
          .setLabel('❌ Recusar')
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await canalSolicitacao.send({
        content: `📢 <@&${guild.roles.cache.find(r => r.name === 'Recrutador')?.id}> <@&${guild.roles.cache.find(r => r.name === 'ADM')?.id}> Nova solicitação de registro!`,
        embeds: [embed],
        components: [row1]
      });

      registroData.messageId = msg.id;
      registroData.channelId = msg.channel.id;
      global.registrosPendentes.set(registroData.userId, registroData);

    } catch (error) {
      console.error('Erro ao enviar para canal de aprovação:', error);
      throw error;
    }
  }
}

module.exports = RegistrationModal;