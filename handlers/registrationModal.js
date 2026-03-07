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
      .setPlaceholder('Ex: Arco 700/700, Frost 600/700...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(200);

    // NOVO CAMPO: Quem te convidou
    const convidadoPorInput = new TextInputBuilder()
      .setCustomId('reg_convidado_por')
      .setLabel('👥 Quem te convidou? (Opcional)')
      .setPlaceholder('Ex: @usuario ou Nick do jogador')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(50);

    const row1 = new ActionRowBuilder().addComponents(nickInput);
    const row2 = new ActionRowBuilder().addComponents(guildaInput);
    const row3 = new ActionRowBuilder().addComponents(armaInput);
    const row4 = new ActionRowBuilder().addComponents(convidadoPorInput);

    modal.addComponents(row1, row2, row3, row4);
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
      // NOVO: Capturar quem convidou
      const convidadoPor = interaction.fields.getTextInputValue('reg_convidado_por')?.trim() || null;

      // Verificar se usuário está na blacklist
      const RegistrationActions = require('./registrationActions');
      const blacklistCheck = RegistrationActions.checkBlacklist(nick, interaction.user.id);
      if (blacklistCheck.isBlacklisted) {
        return await interaction.editReply({
          content: `🚫 **Você está na blacklist!**\n\nMotivo: ${blacklistCheck.reason}\n\nEntre em contato com a staff se acredita que houve um erro.`,
          components: []
        });
      }

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
        convidadoPor, // Salvar na temp
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
      await interaction.deferUpdate();

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
    }
  }

  static async processPlatformSelect(interaction, client) {
    try {
      await interaction.deferUpdate();

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
        content: '⏳ Consultando API do Albion Online...\nIsso pode levar alguns segundos...',
        components: [],
        embeds: []
      });

      tempData.platform = platform;
      const { nick, guilda, arma, server, convidadoPor } = tempData;

      let verification = { valid: false, error: null, details: null };
      let apiError = false;

      try {
        verification = await AlbionAPI.verifyPlayerGuild(nick, guilda, server);
      } catch (apiErr) {
        console.error('❌ Erro na API:', apiErr);
        apiError = true;
        verification.error = 'API indisponível ou timeout';
      }

      const apiVerified = verification.valid;

      if (!apiVerified) {
        console.log(`⚠️ API não validou jogador "${nick}": ${verification.error}`);
        console.log(`📝 Permitindo registro mesmo assim (modo offline)`);
      }

      // Verificar histórico de recusas
      const RegistrationActions = require('./registrationActions');
      const historico = RegistrationActions.getHistoricoRecusas(interaction.user.id, nick);
      const tentativasAnteriores = historico.length;

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
        convidadoPor: convidadoPor, // Salvar no registro
        albionData: verification.details || null,
        apiVerified: apiVerified,
        apiError: apiError || !apiVerified,
        status: 'pendente',
        tentativasAnteriores: tentativasAnteriores, // NOVO: Contador
        historicoRecusas: historico, // NOVO: Histórico completo
        timestamp: Date.now()
      };

      if (!global.registrosPendentes) global.registrosPendentes = new Map();
      global.registrosPendentes.set(interaction.user.id, registroData);

      global.registroTemp.delete(interaction.user.id);

      await this.sendToApprovalChannel(interaction, registroData, client);

      let mensagemSucesso;
      if (apiVerified) {
        mensagemSucesso = '✅ Registro validado pela API e enviado para análise!';
      } else {
        mensagemSucesso = '⚠️ Registro enviado para análise!\n\n_Note: Não foi possível verificar automaticamente na API do Albion. A staff irá analisar manualmente._';
      }

      // Adicionar aviso se houver tentativas anteriores
      if (tentativasAnteriores > 0) {
        mensagemSucesso += `\n\n⚠️ **Atenção:** Esta é sua tentativa **#${tentativasAnteriores + 1}** de registro.`;
      }

      const successEmbed = new EmbedBuilder()
        .setTitle(apiVerified ? '✅ Registro Enviado!' : '⚠️ Registro Enviado (Verificação Manual)')
        .setDescription(mensagemSucesso)
        .addFields(
          { name: '🎮 Nick', value: nick, inline: true },
          { name: '🏰 Guilda', value: guilda || 'Nenhuma', inline: true },
          { name: '🌍 Servidor', value: server, inline: true },
          { name: '💻 Plataforma', value: platform, inline: true },
          { name: '⚔️ Arma/Spec', value: arma, inline: false }
        )
        .setColor(apiVerified ? 0x2ECC71 : 0xF39C12)
        .setFooter({ text: 'Você receberá uma DM quando for analisado' });

      // Adicionar campo de convidado se existir
      if (convidadoPor) {
        successEmbed.addFields({ 
          name: '👥 Convidado por', 
          value: convidadoPor, 
          inline: false 
        });
      }

      await interaction.editReply({
        content: null,
        embeds: [successEmbed],
        components: []
      });

    } catch (error) {
      console.error('Erro em processPlatformSelect:', error);
      await interaction.editReply({
        content: '❌ Erro ao processar registro. Tente novamente.',
        components: []
      });
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
        .setColor(registroData.apiVerified ? 0x2ECC71 : 0xF39C12)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: '👤 Usuário Discord', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: false },
          { name: '🎮 Nick no Albion', value: `\`${registroData.nick}\``, inline: true },
          { name: '🏰 Guilda Informada', value: registroData.guilda || 'Nenhuma', inline: true },
          { name: '🌍 Servidor', value: `${serverEmoji[registroData.server]} ${registroData.server.toUpperCase()}`, inline: true },
          { name: '💻 Plataforma', value: registroData.platform, inline: true },
          { name: '⚔️ Arma/Spec', value: registroData.arma, inline: false }
        )
        .setFooter({ text: `ID: ${registroData.id} | ${registroData.apiVerified ? '✅ Verificado via API' : '⚠️ NÃO verificado na API'}` })
        .setTimestamp();

      // Adicionar campo de convidado se existir
      if (registroData.convidadoPor) {
        embed.addFields({ 
          name: '👥 Convidado por', 
          value: registroData.convidadoPor, 
          inline: true 
        });
      }

      // Mostrar histórico de recusas se houver
      if (registroData.tentativasAnteriores > 0) {
        const ultimasRecusas = registroData.historicoRecusas.slice(-3).map((h, i) => 
          `${i + 1}. ${h.motivo} (${new Date(h.data).toLocaleDateString()})`
        ).join('\n');

        embed.addFields({
          name: `📜 Histórico de Recusas (${registroData.tentativasAnteriores} tentativa(s))`,
          value: ultimasRecusas || 'Ver histórico completo',
          inline: false
        });

        embed.setColor(0xE74C3C); // Vermelho se tiver histórico de recusas
      }

      if (registroData.albionData && registroData.apiVerified) {
        embed.addFields({
          name: '✅ Validação API',
          value: `Jogador encontrado!\nGuilda atual: ${registroData.albionData.guildName || 'Sem guilda'}`,
          inline: false
        });
      } else if (!registroData.apiVerified) {
        embed.addFields({
          name: '⚠️ ATENÇÃO',
          value: 'Este nick não foi encontrado na API do Albion Online.\nVerifique manualmente se o jogador existe antes de aprovar!',
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

      // Adicionar botão de blacklist se for recusa e tiver muitas tentativas
      const row2 = new ActionRowBuilder();
      if (registroData.tentativasAnteriores >= 2) {
        row2.addComponents(
          new ButtonBuilder()
            .setCustomId(`blacklist_add_${registroData.id}`)
            .setLabel('🚫 Blacklist (Banir Nick)')
            .setStyle(ButtonStyle.Danger)
        );
      }

      const components = [row1];
      if (row2.components.length > 0) components.push(row2);

      const msg = await canalSolicitacao.send({
        content: `📢 <@&${guild.roles.cache.find(r => r.name === 'Recrutador')?.id}> <@&${guild.roles.cache.find(r => r.name === 'ADM')?.id}> Nova solicitação de registro!`,
        embeds: [embed],
        components: components
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