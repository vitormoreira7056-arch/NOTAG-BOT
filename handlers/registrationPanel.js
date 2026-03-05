const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle 
} = require('discord.js');

class RegistrationPanel {
  // Criar embed do painel de boas-vindas
  static createWelcomeEmbed() {
    return new EmbedBuilder()
      .setTitle('🛡️ Bem-vindo à Guilda!')
      .setDescription(
        '> Olá, aventureiro! Para fazer parte da nossa guilda, você precisa se registrar.\n\n' +
        '**Como funciona:**\n' +
        '1️⃣ Clique no botão **Registrar** abaixo\n' +
        '2️⃣ Preencha seus dados do Albion Online\n' +
        '3️⃣ Selecione seu servidor e plataforma\n' +
        '4️⃣ Aguarde a validação automática e aprovação da staff\n\n' +
        '**Requisitos:**\n' +
        '• Ter o jogo Albion Online\n' +
        '• Informar seu nick exato do jogo\n' +
        '• Estar na guilda (ou informar guilda atual)\n\n' +
        '_Após o registro, nossa staff irá analisar e atribuir o cargo adequado._'
      )
      .setColor(0x3498DB)
      .setThumbnail('https://cdn.discordapp.com/attachments/.../albion_logo.png') // Opcional: URL do logo
      .setFooter({ text: 'Sistema de Registro • Guild Bot' })
      .setTimestamp();
  }

  // Criar botão de registrar
  static createRegisterButton() {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_abrir_registro')
        .setLabel('📝 Registrar')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✨')
    );
  }

  // Enviar painel no canal
  static async sendPanel(channel) {
    try {
      const embed = this.createWelcomeEmbed();
      const button = this.createRegisterButton();

      await channel.send({
        embeds: [embed],
        components: [button]
      });

      console.log(`✅ Painel de registro enviado em ${channel.name}`);
      return true;
    } catch (error) {
      console.error('Erro ao enviar painel:', error);
      return false;
    }
  }
}

module.exports = RegistrationPanel;