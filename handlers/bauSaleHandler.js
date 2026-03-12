const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits
} = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler de Venda de Baú - Versão Multi-Servidor Corrigida
 * Sistema de vendas de baú com taxas configuráveis por local
 */
class BauSaleHandler {
  constructor() {
    this.pendingSales = new Map();
  }

  static async sendPanel(channel) {
    try {
      console.log(`[BauSale] Sending panel to channel ${channel.id}`);

      const embed = new EmbedBuilder()
        .setTitle('💰 VENDA DE BAÚ')
        .setDescription(
          '**Venda seu baú de forma rápida e segura!**\n\n' +
          '💎 Converta seu baú em saldo imediatamente\n' +
          '📸 Anexe prints comprobatórios\n' +
          '⚡ Processo automatizado com taxas transparentes\n\n' +
          '📎 **Precisa converter imagem em link?**\n' +
          '[Clique aqui para usar o Imgur](https://imgur.com/upload)\n' +
          '[Ou use o Postimages](https://postimages.org/)'
        )
        .setColor(0x9B59B6)
        .setImage('https://i.imgur.com/8QBYRrm.png')
        .setFooter({ text: 'Sistema de Venda de Baú • NOTAG Bot' })
        .setTimestamp();

      const taxasEmbed = new EmbedBuilder()
        .setTitle('📊 TAXAS POR LOCAL')
        .setDescription(
          '🏰 **Royal:** `10%` de taxa\n' +
          '⚫ **Black:** `15%` de taxa\n' +
          '🌲 **Brecilien:** `12%` de taxa\n' +
          '🔴 **Avalon:** `20%` de taxa'
        )
        .setColor(0x34495E);

      const botao = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('btn_vender_bau')
            .setLabel('💎 Vender Baú')
            .setStyle(ButtonStyle.Success)
            .setEmoji('💰')
        );

      await channel.send({
        embeds: [embed, taxasEmbed],
        components: [botao]
      });

      console.log(`[BauSale] Panel sent successfully`);

    } catch (error) {
      console.error(`[BauSale] Error sending panel:`, error);
      throw error;
    }
  }

  static createBauSaleModal() {
    const modal = new ModalBuilder()
      .setCustomId('modal_vender_bau')
      .setTitle('💎 Vender Baú');

    const valorInput = new TextInputBuilder()
      .setCustomId('valor_bau')
      .setLabel('💰 Valor total do baú')
      .setPlaceholder('Ex: 5000000 (não use pontos ou vírgulas)')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(12);

    const printsInput = new TextInputBuilder()
      .setCustomId('links_prints')
      .setLabel('📸 Links das prints (separe por vírgula)')
      .setPlaceholder('https://i.imgur.com/exemplo1.jpg, https://i.imgur.com/exemplo2.jpg')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(1000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(valorInput),
      new ActionRowBuilder().addComponents(printsInput)
    );

    return modal;
  }

  static async showLocationSelect(interaction) {
    try {
      const row = new ActionRowBuilder()
        .addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('select_local_bau')
            .setPlaceholder('🏰 Selecione o local do baú')
            .addOptions(
              new StringSelectMenuOptionBuilder()
                .setLabel('Royal')
                .setValue('royal')
                .setDescription('Taxa: 10%')
                .setEmoji('👑'),
              new StringSelectMenuOptionBuilder()
                .setLabel('Black')
                .setValue('black')
                .setDescription('Taxa: 15%')
                .setEmoji('⚫'),
              new StringSelectMenuOptionBuilder()
                .setLabel('Brecilien')
                .setValue('brecilien')
                .setDescription('Taxa: 12%')
                .setEmoji('🌲'),
              new StringSelectMenuOptionBuilder()
                .setLabel('Avalon')
                .setValue('avalon')
                .setDescription('Taxa: 20%')
                .setEmoji('🔴')
            )
        );

      await interaction.reply({
        content: '🏰 **Selecione o local onde o baú foi aberto:**',
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error(`[BauSale] Error showing location select:`, error);
      await interaction.reply({
        content: '❌ Erro ao mostrar seleção de local.',
        ephemeral: true
      });
    }
  }

  static async processSaleRequest(interaction) {
    try {
      const guildId = interaction.guild.id;
      const local = 'royal'; // Default, será atualizado via select menu
      const valorInput = interaction.fields.getTextInputValue('valor_bau').trim();
      const linksPrintsRaw = interaction.fields.getTextInputValue('links_prints');

      // Validar valor (remover pontos e vírgulas)
      const valorLimpo = valorInput.replace(/\./g, '').replace(/,/g, '');
      const valor = parseInt(valorLimpo);

      if (isNaN(valor) || valor <= 0) {
        return interaction.reply({
          content: '❌ Valor inválido! Digite apenas números (ex: 5000000)',
          ephemeral: true
        });
      }

      if (valor > 1000000000) {
        return interaction.reply({
          content: '❌ Valor muito alto! Máximo permitido: 1.000.000.000',
          ephemeral: true
        });
      }

      const linksPrints = linksPrintsRaw.split(',').map(l => l.trim()).filter(l => l.length > 0);

      if (linksPrints.length === 0) {
        return interaction.reply({
          content: '❌ Você precisa fornecer pelo menos um link de imagem!',
          ephemeral: true
        });
      }

      const validLinks = linksPrints.filter(link =>
        link.startsWith('http') &&
        (link.includes('imgur') || link.includes('postimg') || link.includes('prnt.sc') || 
         link.includes('gyazo') || link.includes('discordapp') || link.includes('cdn.discord'))
      );

      if (validLinks.length === 0) {
        return interaction.reply({
          content: '❌ Nenhum link de imagem válido! Use Imgur, Postimages, Prnt.sc, Gyazo ou Discord.',
          ephemeral: true
        });
      }

      // Buscar configuração do servidor
      const config = global.guildConfig?.get(guildId) || {};
      const taxas = config.taxasBau || {
        royal: 10,
        black: 15,
        brecilien: 12,
        avalon: 20
      };

      const taxaPercentual = taxas[local] || 10;
      const valorTaxa = Math.floor(valor * (taxaPercentual / 100));
      const valorReceber = valor - valorTaxa;

      const saleId = `bau_${Date.now()}_${interaction.user.id}`;
      const saleData = {
        id: saleId,
        guildId: guildId, // ✅ Importante: guardar guildId
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        valor: valor,
        local: local,
        taxaPercentual: taxaPercentual,
        valorTaxa: valorTaxa,
        valorReceber: valorReceber,
        prints: validLinks,
        status: 'pendente',
        timestamp: Date.now()
      };

      if (!global.pendingBauSales) global.pendingBauSales = new Map();
      global.pendingBauSales.set(saleId, saleData);

      console.log(`[BauSale] Sale ${saleId} created: ${valor} in ${local}, tax ${taxaPercentual}% (Guild: ${guildId})`);

      const canalFinanceiro = interaction.guild.channels.cache.find(c => c.name === '📊╠financeiro');
      if (!canalFinanceiro) {
        return interaction.reply({
          content: '❌ Canal financeiro não encontrado! Contate um administrador.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('💎 NOVA VENDA DE BAÚ')
        .setDescription(
          `**Vendedor:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
          `**Valor do Baú:** \`${valor.toLocaleString()}\`\n` +
          `**Local:** ${this.getLocalEmoji(local)} ${local.toUpperCase()}\n` +
          `**Taxa (${taxaPercentual}%):** \`${valorTaxa.toLocaleString()}\`\n` +
          `**Valor a Receber:** \`${valorReceber.toLocaleString()}\``
        )
        .setColor(0x9B59B6)
        .setTimestamp();

      validLinks.forEach((link, index) => {
        embed.addFields({
          name: `📸 Print ${index + 1}`,
          value: `[Ver imagem](${link})`,
          inline: true
        });
      });

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`bau_comprar_${saleId}`)
            .setLabel('💰 Comprar Baú')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`bau_recusar_${saleId}`)
            .setLabel('❌ Recusar')
            .setStyle(ButtonStyle.Danger)
        );

      // Mencionar cargos de admin
      const admRole = interaction.guild.roles.cache.find(r => r.name === 'ADM');
      const staffRole = interaction.guild.roles.cache.find(r => r.name === 'Staff');

      let mentions = '';
      if (admRole) mentions += `<@&${admRole.id}> `;
      if (staffRole) mentions += `<@&${staffRole.id}>`;

      await canalFinanceiro.send({
        content: mentions ? `🔔 ${mentions} Nova venda de baú!` : '🔔 Nova venda de baú!',
        embeds: [embed],
        components: [botoes]
      });

      await interaction.reply({
        content: `✅ Solicitação de venda enviada! Valor: \`${valor.toLocaleString()}\` (Taxa: ${taxaPercentual}%) = Receber: \`${valorReceber.toLocaleString()}\``,
        ephemeral: true
      });

    } catch (error) {
      console.error(`[BauSale] Error processing sale:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar venda do baú. Tente novamente.',
        ephemeral: true
      });
    }
  }

  static getLocalEmoji(local) {
    const emojis = {
      royal: '👑',
      black: '⚫',
      brecilien: '🌲',
      avalon: '🔴'
    };
    return emojis[local] || '📍';
  }

  static async handleComprar(interaction, saleId) {
    try {
      console.log(`[BauSale] Processing purchase ${saleId}`);

      const guildId = interaction.guild.id;
      const sale = global.pendingBauSales?.get(saleId);

      if (!sale) {
        return interaction.reply({
          content: '❌ Venda não encontrada ou já processada!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (sale.guildId && sale.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Esta venda é de outro servidor!',
          ephemeral: true
        });
      }

      // Verificar permissões
      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM') ||
                    interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');
      const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro');

      if (!isADM && !isStaff && !isTesoureiro) {
        return interaction.reply({
          content: '❌ Apenas ADM, Staff ou Tesoureiro podem comprar baús!',
          ephemeral: true
        });
      }

      // ✅ CORRIGIDO: Adicionar guildId nas chamadas Database
      await Database.addSaldo(guildId, sale.userId, sale.valorReceber, 'venda_bau');

      if (sale.valorTaxa > 0) {
        await Database.addTransaction(guildId, {
          type: 'credito',
          userId: 'GUILD_BANK',
          amount: sale.valorTaxa,
          reason: 'taxa_venda_bau',
          approvedBy: interaction.user.id,
          approvedAt: Date.now()
        });
      }

      sale.status = 'aprovado';
      sale.compradoPor = interaction.user.id;

      // Notificar vendedor via DM
      try {
        const vendedor = await interaction.client.users.fetch(sale.userId);

        // ✅ CORRIGIDO: Buscar saldo atual do usuário no servidor correto
        const userData = await Database.getUser(guildId, sale.userId);
        const novoSaldo = userData?.saldo || 0;

        const embed = new EmbedBuilder()
          .setTitle('💎 BAÚ COMPRADO!')
          .setDescription(
            `🎉 **Parabéns!** Seu baú foi comprado com sucesso!\n\n` +
            `> **Valor do Baú:** \`${sale.valor.toLocaleString()}\`\n` +
            `> **Taxa (${sale.taxaPercentual}%):** \`${sale.valorTaxa.toLocaleString()}\`\n` +
            `> **Valor Recebido:** \`${sale.valorReceber.toLocaleString()}\`\n` +
            `> **Local:** ${this.getLocalEmoji(sale.local)} ${sale.local.toUpperCase()}\n` +
            `> **Comprado por:** \`${interaction.user.tag}\`\n` +
            `> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
            `💰 **Novo Saldo:** \`\`\`${novoSaldo.toLocaleString()}\`\`\``
          )
          .setColor(0x9B59B6)
          .setThumbnail('https://i.imgur.com/8QBYRrm.png')
          .setFooter({
            text: 'NOTAG Bot • Sistema Financeiro',
            iconURL: 'https://i.imgur.com/5K9Q5ZK.png'
          })
          .setTimestamp();

        await vendedor.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[BauSale] Could not DM seller ${sale.userId}:`, e.message);
      }

      await interaction.update({
        content: `✅ Baú comprado! \`${sale.valorReceber.toLocaleString()}\` depositados para <@${sale.userId}>.`,
        components: []
      });

      // Log no canal de auditoria
      const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
      if (canalLogs) {
        await canalLogs.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📝 LOG: VENDA DE BAÚ')
              .setDescription(
                `**Vendedor:** <@${sale.userId}>\n` +
                `**Comprador:** <@${interaction.user.id}>\n` +
                `**Valor:** \`${sale.valor.toLocaleString()}\`\n` +
                `**Taxa:** \`${sale.valorTaxa.toLocaleString()}\`\n` +
                `**Local:** ${this.getLocalEmoji(sale.local)} ${sale.local.toUpperCase()}\n` +
                `**Servidor:** ${interaction.guild.name}`
              )
              .setColor(0x9B59B6)
              .setTimestamp()
          ]
        }).catch(() => {});
      }

    } catch (error) {
      console.error(`[BauSale] Error purchasing:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar compra. Verifique se o bot tem permissões adequadas.',
        ephemeral: true
      });
    }
  }

  static async handleRecusar(interaction, saleId) {
    try {
      console.log(`[BauSale] Rejecting sale ${saleId}`);

      const sale = global.pendingBauSales?.get(saleId);
      if (!sale) {
        return interaction.reply({
          content: '❌ Venda não encontrada!',
          ephemeral: true
        });
      }

      // Verificar permissões
      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM') ||
                    interaction.member.permissions.has(PermissionFlagsBits.Administrator);
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');
      const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro');

      if (!isADM && !isStaff && !isTesoureiro) {
        return interaction.reply({
          content: '❌ Apenas ADM, Staff ou Tesoureiro podem recusar vendas!',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_motivo_recusa_bau_${saleId}`)
        .setTitle('Motivo da Recusa');

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_recusa')
        .setLabel('Explique o motivo da recusa')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)
        .setPlaceholder('Ex: Prints insuficientes, valor incorreto, etc.');

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[BauSale] Error showing rejection modal:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir modal.',
        ephemeral: true
      });
    }
  }

  static async processRejection(interaction, saleId) {
    try {
      const motivo = interaction.fields.getTextInputValue('motivo_recusa');
      const sale = global.pendingBauSales?.get(saleId);

      if (!sale) {
        return interaction.reply({
          content: '❌ Venda não encontrada!',
          ephemeral: true
        });
      }

      const guildId = interaction.guild.id;

      // Verificar se é do mesmo servidor
      if (sale.guildId && sale.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Esta venda é de outro servidor!',
          ephemeral: true
        });
      }

      sale.status = 'recusado';
      sale.motivoRecusa = motivo;
      sale.recusadoPor = interaction.user.id;

      // Notificar vendedor via DM
      try {
        const vendedor = await interaction.client.users.fetch(sale.userId);

        const embed = new EmbedBuilder()
          .setTitle('❌ VENDA RECUSADA')
          .setDescription(
            `⚠️ **Sua venda de baú foi recusada.**\n\n` +
            `> **Valor do Baú:** \`${sale.valor.toLocaleString()}\`\n` +
            `> **Local:** ${this.getLocalEmoji(sale.local)} ${sale.local.toUpperCase()}\n` +
            `> **Motivo:** \`\`\`${motivo}\`\`\`\n` +
            `> **Recusado por:** \`${interaction.user.tag}\`\n\n` +
            `💡 *Se tiver dúvidas, entre em contato com a Staff.*`
          )
          .setColor(0xE74C3C)
          .setThumbnail('https://i.imgur.com/8QBYRrm.png')
          .setFooter({
            text: 'NOTAG Bot • Sistema Financeiro',
            iconURL: 'https://i.imgur.com/5K9Q5ZK.png'
          })
          .setTimestamp();

        await vendedor.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[BauSale] Could not DM seller ${sale.userId}:`, e.message);
      }

      await interaction.reply({
        content: `❌ Venda recusada. Motivo enviado para o vendedor.`,
        ephemeral: true
      });

      // Atualizar mensagem original se possível
      try {
        await interaction.message.edit({
          content: `❌ VENDA RECUSADA por ${interaction.user.tag}\n**Motivo:** ${motivo}`,
          components: []
        });
      } catch (e) {
        console.log('[BauSale] Could not edit original message');
      }

      // Log no canal de auditoria
      const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
      if (canalLogs) {
        await canalLogs.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📝 LOG: VENDA DE BAÚ RECUSADA')
              .setDescription(
                `**Vendedor:** <@${sale.userId}>\n` +
                `**Recusado por:** <@${interaction.user.id}>\n` +
                `**Valor:** \`${sale.valor.toLocaleString()}\`\n` +
                `**Motivo:** ${motivo}\n` +
                `**Local:** ${this.getLocalEmoji(sale.local)} ${sale.local.toUpperCase()}`
              )
              .setColor(0xE74C3C)
              .setTimestamp()
          ]
        }).catch(() => {});
      }

    } catch (error) {
      console.error(`[BauSale] Error processing rejection:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar recusa.',
        ephemeral: true
      });
    }
  }
}

module.exports = BauSaleHandler;