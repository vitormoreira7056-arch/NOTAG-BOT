const { 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

class ConfigPanel {
  // Criar embed do painel de configurações
  static createConfigEmbed(guildId) {
    const config = global.guildConfig?.get(guildId) || {
      idioma: 'PT-BR',
      taxaGuilda: 10,
      guildaRegistrada: null,
      xpAtivo: false,
      taxaVendaBau: 10,
      taxaEmprestimo: 5
    };

    return new EmbedBuilder()
      .setTitle('⚙️ **PAINEL DE CONFIGURAÇÕES**')
      .setDescription('Configure as opções do bot para este servidor.\n\n*Apenas membros com cargo **ADM** podem alterar estas configurações.*')
      .setColor(0x3498DB)
      .addFields(
        { 
          name: '🌐 **Idioma**', 
          value: `\`${config.idioma}\`\n*(Fixo por enquanto)*`, 
          inline: true 
        },
        { 
          name: '💰 **Taxa da Guilda**', 
          value: `\`${config.taxaGuilda}%\`\nTaxa em eventos`, 
          inline: true 
        },
        { 
          name: '🏰 **Guilda Registrada**', 
          value: config.guildaRegistrada 
            ? `**${config.guildaRegistrada.nome}**\n🌍 ${config.guildaRegistrada.server}\n✅ Verificada`
            : '❌ *Nenhuma guilda registrada*', 
          inline: false 
        },
        { 
          name: '⭐ **Sistema XP**', 
          value: config.xpAtivo ? '✅ Ativado' : '🔴 Desativado', 
          inline: true 
        },
        { 
          name: '📦 **Taxa Venda Baú**', 
          value: `\`${config.taxaVendaBau}%\`\n🔴 Inativo`, 
          inline: true 
        },
        { 
          name: '💳 **Taxa Empréstimo**', 
          value: `\`${config.taxaEmprestimo}%\`\n🔴 Inativo`, 
          inline: true 
        }
      )
      .setFooter({ text: 'Clique nos botões abaixo para configurar' })
      .setTimestamp();
  }

  // Criar botões do painel
  static createConfigButtons() {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('config_idioma')
          .setLabel('🌐 Idioma')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true), // Fixo por enquanto
        new ButtonBuilder()
          .setCustomId('config_taxa_guilda')
          .setLabel('💰 Taxa Guilda')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('config_registrar_guilda')
          .setLabel('🏰 Registrar Guilda')
          .setStyle(ButtonStyle.Success)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('config_xp')
          .setLabel('⭐ Ativar XP')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true), // Inativo por enquanto
        new ButtonBuilder()
          .setCustomId('config_taxa_bau')
          .setLabel('📦 Taxa Baú')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true), // Inativo por enquanto
        new ButtonBuilder()
          .setCustomId('config_taxa_emprestimo')
          .setLabel('💳 Taxa Empréstimo')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true) // Inativo por enquanto
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('config_atualizar_bot')
          .setLabel('🔄 Atualizar Bot')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔄')
      )
    ];
  }

  // Select menu para taxa da guilda (0-100%)
  static createTaxaSelectMenu() {
    const select = new StringSelectMenuBuilder()
      .setCustomId('select_taxa_guilda')
      .setPlaceholder('💰 Selecione a taxa da guilda (0-100%)');

    const options = [];
    // Adicionar opções de 0 a 100 em steps de 5
    for (let i = 0; i <= 100; i += 5) {
      options.push(
        new StringSelectMenuOptionBuilder()
          .setLabel(`${i}%`)
          .setDescription(`Taxa de ${i}% em eventos e divisões`)
          .setValue(i.toString())
      );
    }

    select.addOptions(options);
    return new ActionRowBuilder().addComponents(select);
  }

  // Modal para registrar guilda
  static createGuildRegistrationModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_registrar_guilda')
      .setTitle('🏰 Registrar Guilda do Servidor');

    const nomeInput = new TextInputBuilder()
      .setCustomId('guilda_nome')
      .setLabel('Nome exato da Guilda no Albion')
      .setPlaceholder('Ex: NoTag, Spike Alliance, etc.')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50);

    const serverInput = new TextInputBuilder()
      .setCustomId('guilda_server')
      .setLabel('Servidor (americas, europe ou asia)')
      .setPlaceholder('europe')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(20);

    const row1 = new ActionRowBuilder().addComponents(nomeInput);
    const row2 = new ActionRowBuilder().addComponents(serverInput);

    modal.addComponents(row1, row2);
    return modal;
  }

  // Enviar painel no canal
  static async sendPanel(channel) {
    try {
      const embed = this.createConfigEmbed(channel.guild.id);
      const buttons = this.createConfigButtons();

      await channel.send({
        embeds: [embed],
        components: buttons
      });

      console.log(`✅ Painel de configurações enviado em ${channel.name}`);
      return true;
    } catch (error) {
      console.error('❌ Erro ao enviar painel de config:', error);
      return false;
    }
  }

  // Atualizar painel existente
  static async updatePanel(message) {
    try {
      const embed = this.createConfigEmbed(message.guild.id);
      const buttons = this.createConfigButtons();

      await message.edit({
        embeds: [embed],
        components: buttons
      });
      return true;
    } catch (error) {
      console.error('❌ Erro ao atualizar painel:', error);
      return false;
    }
  }
}

module.exports = ConfigPanel;