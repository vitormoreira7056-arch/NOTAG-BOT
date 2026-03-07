const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');

class EventPanel {
  // Criar embed do painel principal
  static createPanelEmbed() {
    return new EmbedBuilder()
      .setTitle('⚔️ **CENTRAL DE EVENTOS**')
      .setDescription(
        '> Bem-vindo à central de criação de eventos da guilda!\n\n' +
        '**Como funciona:**\n' +
        '1️⃣ Clique em **Criar Evento** para iniciar\n' +
        '2️⃣ Preencha as informações no formulário\n' +
        '3️⃣ O evento será anunciado no canal <#participar>\n' +
        '4️⃣ Membros podem participar clicando no botão\n\n' +
        '**Tipos de Eventos:**\n' +
        '📋 **Evento Customizado** - Crie do zero\n' +
        '🏰 **Raid Avalon** - Em breve\n' +
        '⚔️ **Gank** - Em breve\n' +
        '📢 **CTA** - Em breve'
      )
      .setColor(0x2C3E50)
      .setImage('https://i.imgur.com/8N7Wf5g.png') // Banner opcional
      .setFooter({ 
        text: 'Sistema de Eventos • NOTAG Bot', 
        iconURL: 'https://i.imgur.com/JR7K1xC.png' 
      })
      .setTimestamp();
  }

  // Criar botões do painel
  static createPanelButtons() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_criar_evento')
        .setLabel('➕ Criar Evento')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId('btn_raid_avalon')
        .setLabel('🏰 Raid Avalon')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId('btn_gank')
        .setLabel('⚔️ Gank')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(true),

      new ButtonBuilder()
        .setCustomId('btn_cta')
        .setLabel('📢 CTA')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );
  }

  // Criar modal de criação de evento
  static createEventModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_criar_evento')
      .setTitle('⚔️ Criar Novo Evento');

    const nomeInput = new TextInputBuilder()
      .setCustomId('evt_nome')
      .setLabel('📛 Nome do Evento')
      .setPlaceholder('Ex: Raid Avalon T8, Gank na Merlyn...')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const descInput = new TextInputBuilder()
      .setCustomId('evt_descricao')
      .setLabel('📝 Descrição')
      .setPlaceholder('Ex: Vamos fazer raid em Avalon, trazer sets T8...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(500);

    const reqInput = new TextInputBuilder()
      .setCustomId('evt_requisitos')
      .setLabel('⚠️ Requisitos (Opcional)')
      .setPlaceholder('Ex: IP 1400+, montaria de gank...')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(false)
      .setMaxLength(200);

    const horarioInput = new TextInputBuilder()
      .setCustomId('evt_horario')
      .setLabel('🕐 Horário')
      .setPlaceholder('Ex: 21:00 (Horário de Brasília)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(30);

    const row1 = new ActionRowBuilder().addComponents(nomeInput);
    const row2 = new ActionRowBuilder().addComponents(descInput);
    const row3 = new ActionRowBuilder().addComponents(reqInput);
    const row4 = new ActionRowBuilder().addComponents(horarioInput);

    modal.addComponents(row1, row2, row3, row4);
    return modal;
  }

  // Enviar painel no canal
  static async sendPanel(channel) {
    try {
      const embed = this.createPanelEmbed();
      const buttons = this.createPanelButtons();

      await channel.send({
        embeds: [embed],
        components: [buttons]
      });

      console.log(`✅ Painel de eventos enviado em ${channel.name}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar painel de eventos:', error);
      return false;
    }
  }
}

module.exports = EventPanel;