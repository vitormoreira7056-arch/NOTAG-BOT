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

/**
 * Handler de Consulta de Saldo - Versão Multi-Servidor
 */
class ConsultarSaldoHandler {

  static async handleConsultarSaldo(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const user = await Database.getUser(guildId, userId);

      if (!user) {
        return interaction.reply({
          content: '❌ Erro ao consultar seu saldo. Tente novamente mais tarde.',
          ephemeral: true
        });
      }

      const saldo = user.saldo || 0;
      const emprestimosPendentes = user.emprestimosPendentes || 0;
      const saldoLiquido = saldo - emprestimosPendentes;
      const totalRecebido = user.totalRecebido || 0;
      const totalSacado = user.totalSacado || 0;
      const totalEmprestimos = user.totalEmprestimos || 0;

      const embed = new EmbedBuilder()
        .setTitle('💰 CONSULTAR SALDO')
        .setDescription(
          `📊 **Resumo Financeiro - ${interaction.guild.name}**\n\n` +
          `💵 **Saldo Bruto:** \`${saldo.toLocaleString()}\`\n` +
          `📉 **Empréstimos Pendentes:** \`${emprestimosPendentes.toLocaleString()}\`\n` +
          `✨ **Saldo Líquido Disponível:** \`${saldoLiquido.toLocaleString()}\`\n\n` +
          `📈 **Estatísticas:**\n` +
          `> Total Recebido: \`${totalRecebido.toLocaleString()}\`\n` +
          `> Total Sacado: \`${totalSacado.toLocaleString()}\`\n` +
          `> Total em Empréstimos: \`${totalEmprestimos.toLocaleString()}\``
        )
        .setColor(0x2ECC71)
        .setFooter({ 
          text: `NOTAG Bot • ${interaction.guild.name} • ${new Date().toLocaleDateString('pt-BR')}` 
        })
        .setTimestamp();

      // Buscar histórico recente
      const historico = await Database.getUserTransactions(guildId, userId, 5);

      if (historico && historico.length > 0) {
        let historicoTexto = '';
        historico.forEach((trans, index) => {
          const tipo = trans.type === 'credito' ? '➕' : '➖';
          const data = new Date(trans.created_at).toLocaleDateString('pt-BR');
          historicoTexto += `${tipo} ${trans.amount.toLocaleString()} - ${data}\n`;
        });

        embed.addFields({
          name: '📋 Últimas Movimentações',
          value: historicoTexto || 'Nenhuma movimentação recente',
          inline: false
        });
      }

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (error) {
      console.error('[ConsultarSaldo] Erro ao consultar saldo:', error);
      await interaction.reply({
        content: '❌ Erro ao consultar saldo.',
        ephemeral: true
      });
    }
  }

  static async handleSacarSaldo(interaction) {
    try {
      const modal = new ModalBuilder()
        .setCustomId('modal_sacar_saldo')
        .setTitle('💸 Solicitar Saque');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor_saque')
        .setLabel('Valor do saque')
        .setPlaceholder('Ex: 100000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(15);

      modal.addComponents(new ActionRowBuilder().addComponents(valorInput));

      await interaction.showModal(modal);

    } catch (error) {
      console.error('[ConsultarSaldo] Erro ao abrir modal de saque:', error);
      await interaction.reply({
        content: '❌ Erro ao abrir formulário de saque.',
        ephemeral: true
      });
    }
  }

  static async handleSolicitarEmprestimo(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const user = await Database.getUser(guildId, userId);

      if (user && user.emprestimosPendentes > 0) {
        return interaction.reply({
          content: `❌ Você já possui um empréstimo pendente de \`${user.emprestimosPendentes.toLocaleString()}\`!\n\nQuite o empréstimo atual antes de solicitar outro.`,
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_solicitar_emprestimo')
        .setTitle('💳 Solicitar Empréstimo');

      const valorInput = new TextInputBuilder()
        .setCustomId('valor_emprestimo')
        .setLabel('Valor do empréstimo')
        .setPlaceholder('Ex: 500000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(15);

      modal.addComponents(new ActionRowBuilder().addComponents(valorInput));

      await interaction.showModal(modal);

    } catch (error) {
      console.error('[ConsultarSaldo] Erro ao abrir modal de empréstimo:', error);
      await interaction.reply({
        content: '❌ Erro ao abrir formulário de empréstimo.',
        ephemeral: true
      });
    }
  }

  static async handleTransferirSaldo(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      const user = await Database.getUser(guildId, userId);
      const saldo = user?.saldo || 0;

      if (saldo <= 0) {
        return interaction.reply({
          content: '❌ Você não possui saldo para transferir!',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_transferir_saldo')
        .setTitle('🔄 Transferir Saldo');

      const idInput = new TextInputBuilder()
        .setCustomId('id_usuario')
        .setLabel('ID do usuário destino')
        .setPlaceholder('Cole o ID do usuário (ex: 123456789012345678)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(17)
        .setMaxLength(19);

      const valorInput = new TextInputBuilder()
        .setCustomId('valor_transferencia')
        .setLabel('Valor a transferir')
        .setPlaceholder('Ex: 100000')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(15);

      const motivoInput = new TextInputBuilder()
        .setCustomId('comentario_transferencia')
        .setLabel('Motivo (opcional)')
        .setPlaceholder('Ex: Pagamento de dívida, presente, etc.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder().addComponents(idInput),
        new ActionRowBuilder().addComponents(valorInput),
        new ActionRowBuilder().addComponents(motivoInput)
      );

      await interaction.showModal(modal);

    } catch (error) {
      console.error('[ConsultarSaldo] Erro ao abrir modal de transferência:', error);
      await interaction.reply({
        content: '❌ Erro ao abrir formulário de transferência.',
        ephemeral: true
      });
    }
  }

  static async sendPanel(channel) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('💰 CONSULTAR SALDO')
        .setDescription(
          'Bem-vindo ao sistema bancário da guilda!\n\n' +
          'Aqui você pode consultar seu saldo, realizar saques, solicitar empréstimos e transferir valores para outros jogadores.\n\n' +
          '💡 **Todos os valores são específicos deste servidor.**'
        )
        .setColor(0x3498DB)
        .addFields(
          {
            name: '📊 Consultar Saldo',
            value: 'Veja seu saldo atual, histórico e estatísticas',
            inline: true
          },
          {
            name: '💸 Sacar',
            value: 'Solicite um saque do seu saldo',
            inline: true
          },
          {
            name: '💳 Empréstimo',
            value: 'Solicite um empréstimo (sujeito a aprovação)',
            inline: true
          },
          {
            name: '🔄 Transferir',
            value: 'Transfira saldo para outro jogador',
            inline: true
          }
        )
        .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
        .setTimestamp();

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('btn_consultar_saldo')
            .setLabel('📊 Meu Saldo')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('btn_sacar_saldo')
            .setLabel('💸 Sacar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('btn_solicitar_emprestimo')
            .setLabel('💳 Empréstimo')
            .setStyle(ButtonStyle.Secondary),
          new ButtonBuilder()
            .setCustomId('btn_transferir_saldo')
            .setLabel('🔄 Transferir')
            .setStyle(ButtonStyle.Secondary)
        );

      await channel.send({ embeds: [embed], components: [buttons] });
      console.log(`[ConsultarSaldo] Painel enviado em #${channel.name}`);

    } catch (error) {
      console.error('[ConsultarSaldo] Erro ao enviar painel:', error);
      throw error;
    }
  }
}

module.exports = ConsultarSaldoHandler;