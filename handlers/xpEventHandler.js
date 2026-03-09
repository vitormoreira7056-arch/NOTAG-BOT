const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const XpHandler = require('./xpHandler');
const Database = require('../utils/database');

class XpEventHandler {
  constructor() {
    this.activeXpEvents = new Map();
  }

  /**
   * Cria o modal para criar evento de XP - usado internamente
   */
  static async createXpEventModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_criar_xp_event')
      .setTitle('🏆 Criar Evento de Conquista');

    const nomeInput = new TextInputBuilder()
      .setCustomId('nome_evento')
      .setLabel('Nome do Evento')
      .setPlaceholder('Ex: Conclua 6 Raid Avalon 6.1')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(100);

    const descricaoInput = new TextInputBuilder()
      .setCustomId('descricao')
      .setLabel('Descrição detalhada')
      .setPlaceholder('Descreva o objetivo do evento...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    const requisitoInput = new TextInputBuilder()
      .setCustomId('requisito')
      .setLabel('Requisito para completar')
      .setPlaceholder('Ex: Participar de 6 Raids Avalon 6.1')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(200);

    const xpInput = new TextInputBuilder()
      .setCustomId('xp_recompensa')
      .setLabel('XP de recompensa')
      .setPlaceholder('Ex: 1000')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10);

    const insigniaInput = new TextInputBuilder()
      .setCustomId('insignia_nome')
      .setLabel('Nome da Insígnia (Conquista)')
      .setPlaceholder('Ex: Conquistador de Avalon 6.1')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nomeInput),
      new ActionRowBuilder().addComponents(descricaoInput),
      new ActionRowBuilder().addComponents(requisitoInput),
      new ActionRowBuilder().addComponents(xpInput),
      new ActionRowBuilder().addComponents(insigniaInput)
    );

    return modal;
  }

  /**
   * Mostra o modal de criação de evento - FUNÇÃO QUE ESTAVA FALTANDO
   * Chamada pelo botão btn_criar_xp_event no index.js
   */
  static async showCreateEventModal(interaction) {
    try {
      console.log(`[XpEventHandler] Showing create event modal for user ${interaction.user.id}`);

      const modal = await this.createXpEventModal();
      await interaction.showModal(modal);

      console.log(`[XpEventHandler] Modal shown successfully`);
    } catch (error) {
      console.error(`[XpEventHandler] Error showing create event modal:`, error);

      if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: '❌ Erro ao abrir modal de criação de evento. Tente novamente.',
          ephemeral: true
        });
      }
    }
  }

  static async processCreateXpEvent(interaction) {
    try {
      const nome = interaction.fields.getTextInputValue('nome_evento');
      const descricao = interaction.fields.getTextInputValue('descricao');
      const requisito = interaction.fields.getTextInputValue('requisito');
      const xp = parseInt(interaction.fields.getTextInputValue('xp_recompensa'));
      const insigniaNome = interaction.fields.getTextInputValue('insignia_nome');

      if (isNaN(xp) || xp <= 0) {
        return interaction.reply({
          content: '❌ Valor de XP inválido!',
          ephemeral: true
        });
      }

      const eventId = `xp_event_${Date.now()}`;
      const eventData = {
        id: eventId,
        nome: nome,
        descricao: descricao,
        requisito: requisito,
        xpRecompensa: xp,
        insigniaNome: insigniaNome,
        criadorId: interaction.user.id,
        guildId: interaction.guild.id,
        status: 'ativo',
        participantes: [],
        criadoEm: Date.now()
      };

      if (!global.activeXpEvents) global.activeXpEvents = new Map();
      global.activeXpEvents.set(eventId, eventData);

      console.log(`[XpEvent] Created XP event: ${nome}`);

      // Enviar para canal xp-event
      const canalXpEvent = interaction.guild.channels.cache.find(c => c.name === '⭐╠xp-event');
      if (canalXpEvent) {
        await this.sendXpEventPanel(canalXpEvent, eventData);
      }

      await interaction.reply({
        content: `✅ Evento de conquista "${nome}" criado!`,
        ephemeral: true
      });

    } catch (error) {
      console.error(`[XpEvent] Error creating XP event:`, error);
      await interaction.reply({
        content: '❌ Erro ao criar evento de conquista.',
        ephemeral: true
      });
    }
  }

  static async sendXpEventPanel(channel, eventData) {
    const embed = new EmbedBuilder()
      .setTitle(`🏆 ${eventData.nome}`)
      .setDescription(
        `📋 **${eventData.descricao}**\n\n` +
        `🎯 **Requisito:** ${eventData.requisito}\n` +
        `💎 **XP:** \`${eventData.xpRecompensa}\`\n` +
        `🏅 **Conquista:** ${eventData.insigniaNome}\n` +
        `👤 **Criado por:** <@${eventData.criadorId}>\n` +
        `📅 **Início:** ${new Date(eventData.criadoEm).toLocaleDateString('pt-BR')}`
      )
      .setColor(0xFFD700)
      .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
      .setFooter({ text: 'Evento de Conquista • NOTAG Bot' })
      .setTimestamp();

    const botoes = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`xp_event_finalizar_${eventData.id}`)
          .setLabel('✅ Finalizar Evento')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`xp_event_cancelar_${eventData.id}`)
          .setLabel('❌ Cancelar')
          .setStyle(ButtonStyle.Danger)
      );

    await channel.send({
      content: `🔔 Novo evento de conquista disponível!`,
      embeds: [embed],
      components: [botoes]
    });
  }

  static async finalizarXpEvent(interaction, eventId) {
    try {
      const eventData = global.activeXpEvents?.get(eventId);
      if (!eventData) {
        return interaction.reply({
          content: '❌ Evento não encontrado!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

      if (!isADM && !isStaff) {
        return interaction.reply({
          content: '❌ Apenas ADM ou Staff podem finalizar!',
          ephemeral: true
        });
      }

      // Verificar eventos arquivados que correspondem ao nome
      const eventHistory = Database.eventHistory || [];
      const matchingEvents = eventHistory.filter(e =>
        e.guildId === interaction.guild.id &&
        e.dados?.nome?.toLowerCase().includes(eventData.nome.toLowerCase()) ||
        eventData.nome.toLowerCase().includes(e.dados?.nome?.toLowerCase())
      );

      // Para cada participante dos eventos matching, dar XP e insígnia
      const processedUsers = new Set();

      for (const event of matchingEvents) {
        if (event.dados?.distribuicao) {
          for (const participant of event.dados.distribuicao) {
            if (!processedUsers.has(participant.userId)) {
              processedUsers.add(participant.userId);

              // Dar XP
              await XpHandler.addXp(
                participant.userId,
                eventData.xpRecompensa,
                `Evento de Conquista: ${eventData.nome}`,
                interaction.guild,
                interaction.guild.channels.cache.find(c => c.name === '📜╠log-xp')
              );

              // Dar insígnia
              const insigniaId = `event_${eventId}_${Date.now()}`;
              await XpHandler.addInsignia(participant.userId, insigniaId);
            }
          }
        }
      }

      eventData.status = 'finalizado';
      eventData.finalizadoPor = interaction.user.id;
      eventData.finalizadoEm = Date.now();

      await interaction.update({
        content: `✅ Evento finalizado! ${processedUsers.size} jogadores receberam recompensas.`,
        components: []
      });

      console.log(`[XpEvent] Finalized XP event: ${eventData.nome}`);

    } catch (error) {
      console.error(`[XpEvent] Error finalizing event:`, error);
      await interaction.reply({
        content: '❌ Erro ao finalizar evento.',
        ephemeral: true
      });
    }
  }

  static async cancelarXpEvent(interaction, eventId) {
    try {
      const eventData = global.activeXpEvents?.get(eventId);
      if (!eventData) {
        return interaction.reply({
          content: '❌ Evento não encontrado!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

      if (!isADM && !isStaff) {
        return interaction.reply({
          content: '❌ Apenas ADM ou Staff podem cancelar!',
          ephemeral: true
        });
      }

      eventData.status = 'cancelado';
      eventData.canceladoPor = interaction.user.id;

      await interaction.update({
        content: `❌ Evento cancelado por ${interaction.user.tag}`,
        components: []
      });

    } catch (error) {
      console.error(`[XpEvent] Error canceling event:`, error);
      await interaction.reply({
        content: '❌ Erro ao cancelar evento.',
        ephemeral: true
      });
    }
  }
}

module.exports = XpEventHandler;