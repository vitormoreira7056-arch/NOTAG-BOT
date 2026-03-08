const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const Database = require('../utils/database');

class DepositHandler {
  static async sendPanel(channel) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('💵 SISTEMA DE DEPÓSITOS')
        .setDescription(
          'Bem-vindo ao sistema de depósitos do banco da guilda!\n\n' +
          'Aqui você pode adicionar fundos à sua conta para participar de eventos, ' +
          'fazer compras internas ou quitar dívidas.\n\n' +
          '**Como funciona:**\n' +
          '1. Clique em **"Realizar Depósito"**\n' +
          '2. Informe o valor desejado\n' +
          '3. Envie o comprovante para um <@&tesoureiro>\n' +
          '4. Seu saldo será creditado em breve'
        )
        .setColor(0x2ECC71)
        .addFields(
          {
            name: '💰 Saldo em Conta',
            value: 'Use o canal <#consultar-saldo> para verificar seu saldo atual',
            inline: false
          },
          {
            name: '📋 Histórico',
            value: 'Todos os depósitos são registrados e auditados',
            inline: false
          }
        )
        .setFooter({ text: 'Sistema Bancário • NOTAG Bot' })
        .setTimestamp();

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('btn_deposito_novo')
            .setLabel('💵 Realizar Depósito')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('btn_historico_depositos')
            .setLabel('📋 Meu Histórico')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('btn_ajuda_deposito')
            .setLabel('❓ Ajuda')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({ embeds: [embed], components: [buttons] });
      console.log(`[DepositHandler] Painel de depósitos enviado em #${channel.name}`);
    } catch (error) {
      console.error('[DepositHandler] Erro ao enviar painel:', error);
      throw error;
    }
  }

  static async handleDepositoButton(interaction) {
    try {
      const modal = new ModalBuilder()
        .setCustomId('modal_deposito_valor')
        .setTitle('💵 Novo Depósito');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor_deposito')
        .setLabel('Valor do depósito (em milhões)')
        .setPlaceholder('Ex: 5 (para 5 milhões)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      const comprovanteInput = new TextInputBuilder()
        .setCustomId('comprovante_deposito')
        .setLabel('Link do comprovante (screenshot)')
        .setPlaceholder('Cole aqui o link da imagem do comprovante')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(valorInput),
        new ActionRowBuilder().addComponents(comprovanteInput)
      );

      await interaction.showModal(modal);
    } catch (error) {
      console.error(`[DepositHandler] Erro ao abrir modal:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir formulário de depósito.',
        ephemeral: true
      });
    }
  }

  static async processDeposito(interaction) {
    try {
      const valor = parseFloat(interaction.fields.getTextInputValue('valor_deposito'));
      const comprovante = interaction.fields.getTextInputValue('comprovante_deposito').trim();

      if (isNaN(valor) || valor <= 0) {
        return interaction.reply({
          content: '❌ Valor inválido! Digite um número positivo.',
          ephemeral: true
        });
      }

      // Verificar se existe canal de logs de banco
      const logChannel = interaction.guild.channels.cache.find(
        c => c.name === '📜╠logs-banco'
      );

      if (!logChannel) {
        return interaction.reply({
          content: '❌ Canal de logs do banco não encontrado! Contate um administrador.',
          ephemeral: true
        });
      }

      // Criar registro de depósito pendente
      const depositId = `dep_${Date.now()}_${interaction.user.id}`;

      const embedSolicitacao = new EmbedBuilder()
        .setTitle('💵 NOVA SOLICITAÇÃO DE DEPÓSITO')
        .setDescription(`Depósito solicitado por ${interaction.user}`)
        .setColor(0xF1C40F)
        .addFields(
          { name: '👤 Usuário', value: `<@${interaction.user.id}>`, inline: true },
          { name: '💰 Valor', value: `${valor} milhões`, inline: true },
          { name: '📅 Data', value: new Date().toLocaleString('pt-BR'), inline: true },
          { name: '📎 Comprovante', value: comprovante, inline: false }
        )
        .setFooter({ text: `ID: ${depositId}` });

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`dep_aprovar_${depositId}_${interaction.user.id}_${valor}`)
            .setLabel('✅ Aprovar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`dep_recusar_${depositId}`)
            .setLabel('❌ Recusar')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`dep_verificar_${comprovante}`)
            .setLabel('🔍 Verificar')
            .setStyle(ButtonStyle.Secondary)
        );

      await logChannel.send({ embeds: [embedSolicitacao], components: [buttons] });

      await interaction.reply({
        content: `✅ **Solicitação de depósito enviada!**\n\n` +
                `💰 Valor: ${valor} milhões\n` +
                `⏰ Aguarde a aprovação de um tesoureiro.\n` +
                `📋 ID: ${depositId}`,
        ephemeral: true
      });

      console.log(`[DepositHandler] Depósito solicitado: ${depositId} - ${valor}M por ${interaction.user.tag}`);

    } catch (error) {
      console.error(`[DepositHandler] Erro ao processar depósito:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar solicitação de depósito.',
        ephemeral: true
      });
    }
  }

  static async handleAprovacao(interaction, depositId, userId, valor, aprovado) {
    try {
      const membro = await interaction.guild.members.fetch(userId).catch(() => null);

      if (!aprovado) {
        await interaction.message.edit({ components: [] });
        await interaction.reply({
          content: `❌ Depósito ${depositId} recusado.`,
          ephemeral: true
        });
        return;
      }

      // Adicionar saldo no banco de dados
      const amount = parseFloat(valor) * 1000000; // Converter milhões para unidades
      Database.addSaldo(userId, amount, 'deposito_aprovado');

      // Atualizar mensagem original
      const embedAprovado = EmbedBuilder.from(interaction.message.embeds[0])
        .setTitle('✅ DEPÓSITO APROVADO')
        .setColor(0x2ECC71)
        .addFields(
          { name: '✅ Aprovado por', value: `<@${interaction.user.id}>`, inline: true },
          { name: '💳 Saldo Creditado', value: `${valor} milhões`, inline: true }
        );

      await interaction.message.edit({ embeds: [embedAprovado], components: [] });

      // Notificar usuário
      if (membro) {
        try {
          await membro.send({
            content: `✅ **Depósito Aprovado!**\n\n` +
                    `💰 Valor: ${valor} milhões\n` +
                    `💳 Seu saldo foi creditado com sucesso.\n` +
                    `Use /saldo para consultar.`
          });
        } catch (dmError) {
          console.log(`[DepositHandler] Não foi possível DM o usuário ${userId}`);
        }
      }

      await interaction.reply({
        content: `✅ Depósito aprovado e saldo creditado para <@${userId}>`,
        ephemeral: true
      });

      console.log(`[DepositHandler] Depósito aprovado: ${depositId} - ${valor}M para ${userId}`);

    } catch (error) {
      console.error(`[DepositHandler] Erro na aprovação:`, error);
      await interaction.reply({
        content: '❌ Erro ao aprovar depósito.',
        ephemeral: true
      });
    }
  }

  static async showHistorico(interaction) {
    try {
      const history = Database.getUserHistory(interaction.user.id)
        .filter(t => t.type === 'credito' && t.reason === 'deposito_aprovado')
        .slice(-10);

      if (history.length === 0) {
        return interaction.reply({
          content: '❌ Você não possui depósitos registrados.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('📋 HISTÓRICO DE DEPÓSITOS')
        .setDescription(`Últimos ${history.length} depósitos:`)
        .setColor(0x3498DB);

      history.forEach((dep, index) => {
        const date = new Date(dep.timestamp).toLocaleDateString('pt-BR');
        embed.addFields({
          name: `${index + 1}. ${date}`,
          value: `💰 ${(dep.amount / 1000000).toFixed(2)} milhões`,
          inline: false
        });
      });

      await interaction.reply({ embeds: [embed], ephemeral: true });

    } catch (error) {
      console.error(`[DepositHandler] Erro ao mostrar histórico:`, error);
      await interaction.reply({
        content: '❌ Erro ao carregar histórico.',
        ephemeral: true
      });
    }
  }

  static async showAjuda(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('❓ AJUDA - SISTEMA DE DEPÓSITOS')
      .setDescription(
        '**Como realizar um depósito:**\n\n' +
        '1️⃣ Clique em "Realizar Depósito"\n' +
        '2️⃣ Informe o valor em milhões (ex: 5 para 5 milhões)\n' +
        '3️⃣ Envie uma screenshot do comprovante (upload em algum servidor e cole o link)\n' +
        '4️⃣ Aguarde aprovação de um tesoureiro\n\n' +
        '**Observações:**\n' +
        '• O valor mínimo é 1 milhão\n' +
        '• Depósitos só são creditados após aprovação\n' +
        '• Guarde o ID da transação para referência\n' +
        '• Em caso de dúvidas, contate um <@&tesoureiro>'
      )
      .setColor(0x95A5A6);

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
}

module.exports = DepositHandler;