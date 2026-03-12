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
 * Handler Financeiro - Versão Multi-Servidor
 * Gerencia saques, empréstimos e transferências
 */
class FinanceHandler {

  // ==================== SAQUE ====================

  static async processWithdrawRequest(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const valorInput = interaction.fields.getTextInputValue('valor_saque').trim();
      const valorLimpo = valorInput.replace(/\./g, '').replace(/,/g, '');
      const valor = parseInt(valorLimpo);

      if (isNaN(valor) || valor <= 0) {
        return interaction.reply({
          content: '❌ Valor inválido! Digite apenas números (ex: 500000 para 500k)',
          ephemeral: true
        });
      }

      const user = await Database.getUser(guildId, userId);

      if (!user || user.saldo === undefined) {
        return interaction.reply({
          content: '❌ Erro ao consultar seu saldo. Tente novamente mais tarde.',
          ephemeral: true
        });
      }

      if (user.saldo < valor) {
        return interaction.reply({
          content: `❌ Saldo insuficiente! Você tem \`${valor.toLocaleString()}\` mas tentou sacar \`${valor.toLocaleString()}\`.`,
          ephemeral: true
        });
      }

      const withdrawalId = `wd_${Date.now()}_${userId}`;
      const withdrawalData = {
        id: withdrawalId,
        guildId: guildId,
        userId: userId,
        userTag: interaction.user.tag,
        valor: valor,
        saldoAtual: user.saldo,
        status: 'pendente',
        timestamp: Date.now()
      };

      if (!global.pendingWithdrawals) global.pendingWithdrawals = new Map();
      global.pendingWithdrawals.set(withdrawalId, withdrawalData);

      console.log(`[Finance] Withdrawal request ${withdrawalId} created by ${userId} for ${valor} (Guild: ${guildId})`);

      const canalFinanceiro = interaction.guild.channels.cache.find(c => c.name === '📊╠financeiro');
      if (!canalFinanceiro) {
        return interaction.reply({
          content: '❌ Canal financeiro não encontrado! Contate um ADM.',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('💸 SOLICITAÇÃO DE SAQUE')
        .setDescription(
          `**Jogador:** <@${userId}> (${interaction.user.tag})\n` +
          `**Valor Solicitado:** \`${valor.toLocaleString()}\`\n` +
          `**Saldo Atual:** \`${user.saldo.toLocaleString()}\`\n` +
          `**Saldo Após Saque:** \`${(user.saldo - valor).toLocaleString()}\`\n` +
          `**Servidor:** ${interaction.guild.name}`
        )
        .setColor(0xE74C3C)
        .setTimestamp();

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fin_confirmar_saque_${withdrawalId}`)
            .setLabel('✅ Confirmar Saque')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`fin_recusar_saque_${withdrawalId}`)
            .setLabel('❌ Recusar Saque')
            .setStyle(ButtonStyle.Danger)
        );

      const admRole = interaction.guild.roles.cache.find(r => r.name === 'ADM');
      const staffRole = interaction.guild.roles.cache.find(r => r.name === 'Staff');
      const tesoureiroRole = interaction.guild.roles.cache.find(r => r.name === 'tesoureiro');

      let mentions = '';
      if (tesoureiroRole) mentions += `<@&${tesoureiroRole.id}> `;
      if (admRole) mentions += `<@&${admRole.id}> `;
      if (staffRole) mentions += `<@&${staffRole.id}>`;

      await canalFinanceiro.send({
        content: mentions ? `🔔 ${mentions} Nova solicitação de saque!` : '🔔 Nova solicitação de saque!',
        embeds: [embed],
        components: [botoes]
      });

      await interaction.reply({
        content: `✅ Solicitação de saque de \`${valor.toLocaleString()}\` enviada para análise! Aguarde aprovação.`,
        ephemeral: true
      });

    } catch (error) {
      console.error(`[Finance] Error processing withdrawal request:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar solicitação de saque.',
        ephemeral: true
      });
    }
  }

  static async handleConfirmWithdrawal(interaction, withdrawalId) {
    try {
      console.log(`[Finance] Confirming withdrawal ${withdrawalId}`);

      const withdrawal = global.pendingWithdrawals?.get(withdrawalId);
      if (!withdrawal) {
        return interaction.reply({
          content: '❌ Solicitação de saque não encontrada ou já processada!',
          ephemeral: true
        });
      }

      const guildId = interaction.guild.id;

      // Verificar se é do mesmo servidor
      if (withdrawal.guildId && withdrawal.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Esta solicitação é de outro servidor!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');
      const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro');

      if (!isADM && !isStaff && !isTesoureiro) {
        return interaction.reply({
          content: '❌ Apenas ADM, Staff ou Tesoureiro podem confirmar saques!',
          ephemeral: true
        });
      }

      await Database.removeSaldo(guildId, withdrawal.userId, withdrawal.valor, 'saque_aprovado');

      withdrawal.status = 'aprovado';
      withdrawal.aprovadoPor = interaction.user.id;
      withdrawal.aprovadoEm = Date.now();

      try {
        const user = await interaction.client.users.fetch(withdrawal.userId);
        const userData = await Database.getUser(guildId, withdrawal.userId);
        const novoSaldo = userData?.saldo || 0;

        const embed = new EmbedBuilder()
          .setTitle('✅ SAQUE APROVADO')
          .setDescription(
            `💰 **Transação Concluída com Sucesso!**\n\n` +
            `> **Valor Sacado:** \`${withdrawal.valor.toLocaleString()}\`\n` +
            `> **Aprovado por:** \`${interaction.user.tag}\`\n` +
            `> **Data:** ${new Date().toLocaleString('pt-BR')}\n` +
            `> **Servidor:** ${interaction.guild.name}\n\n` +
            `💳 **Novo Saldo:** \`${novoSaldo.toLocaleString()}\``
          )
          .setColor(0x2ECC71)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        await user.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[Finance] Could not DM user ${withdrawal.userId}`);
      }

      await interaction.update({
        content: `✅ Saque de \`${withdrawal.valor.toLocaleString()}\` aprovado para ${withdrawal.userTag}!`,
        components: []
      });

      const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
      if (canalLogs) {
        await canalLogs.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📝 LOG: SAQUE APROVADO')
              .setDescription(
                `**Jogador:** <@${withdrawal.userId}>\n` +
                `**Valor:** \`${withdrawal.valor.toLocaleString()}\`\n` +
                `**Aprovado por:** <@${interaction.user.id}>\n` +
                `**Servidor:** ${interaction.guild.name}`
              )
              .setColor(0x2ECC71)
              .setTimestamp()
          ]
        });
      }

    } catch (error) {
      console.error(`[Finance] Error confirming withdrawal:`, error);
      await interaction.reply({
        content: '❌ Erro ao confirmar saque.',
        ephemeral: true
      });
    }
  }

  static async handleRejectWithdrawal(interaction, withdrawalId) {
    try {
      console.log(`[Finance] Rejecting withdrawal ${withdrawalId}`);

      const withdrawal = global.pendingWithdrawals?.get(withdrawalId);
      if (!withdrawal) {
        return interaction.reply({
          content: '❌ Solicitação não encontrada!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (withdrawal.guildId && withdrawal.guildId !== interaction.guild.id) {
        return interaction.reply({
          content: '❌ Esta solicitação é de outro servidor!',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_motivo_recusa_saque_${withdrawalId}`)
        .setTitle('Motivo da Recusa');

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_recusa')
        .setLabel('Explique o motivo da recusa')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

      modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
      await interaction.showModal(modal);

    } catch (error) {
      console.error(`[Finance] Error showing rejection modal:`, error);
      await interaction.reply({
        content: '❌ Erro ao abrir modal de recusa.',
        ephemeral: true
      });
    }
  }

  static async processWithdrawalRejection(interaction, withdrawalId) {
    try {
      const motivo = interaction.fields.getTextInputValue('motivo_recusa');
      const withdrawal = global.pendingWithdrawals?.get(withdrawalId);

      if (!withdrawal) {
        return interaction.reply({
          content: '❌ Solicitação não encontrada!',
          ephemeral: true
        });
      }

      const guildId = interaction.guild.id;

      withdrawal.status = 'recusado';
      withdrawal.motivoRecusa = motivo;
      withdrawal.recusadoPor = interaction.user.id;

      try {
        const user = await interaction.client.users.fetch(withdrawal.userId);

        const embed = new EmbedBuilder()
          .setTitle('❌ SAQUE RECUSADO')
          .setDescription(
            `⚠️ **Sua solicitação de saque foi recusada.**\n\n` +
            `> **Valor Solicitado:** \`${withdrawal.valor.toLocaleString()}\`\n` +
            `> **Motivo:** \`\`\`${motivo}\`\`\`\n` +
            `> **Recusado por:** \`${interaction.user.tag}\`\n` +
            `> **Servidor:** ${interaction.guild.name}\n\n` +
            `💡 *Se você tiver dúvidas, entre em contato com um administrador.*`
          )
          .setColor(0xE74C3C)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        await user.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[Finance] Could not DM user ${withdrawal.userId}`);
      }

      await interaction.reply({
        content: `❌ Saque recusado. Motivo enviado para o jogador.`,
        ephemeral: true
      });

      try {
        await interaction.message.edit({
          content: `❌ SAQUE RECUSADO por ${interaction.user.tag}\n**Motivo:** ${motivo}`,
          components: []
        });
      } catch (e) {
        console.log('[Finance] Could not edit original message');
      }

    } catch (error) {
      console.error(`[Finance] Error processing rejection:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar recusa.',
        ephemeral: true
      });
    }
  }

  // ==================== EMPRÉSTIMO ====================

  static async processLoanRequest(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const valorInput = interaction.fields.getTextInputValue('valor_emprestimo').trim();
      const valorLimpo = valorInput.replace(/\./g, '').replace(/,/g, '');
      const valor = parseInt(valorLimpo);

      if (isNaN(valor) || valor <= 0) {
        return interaction.reply({
          content: '❌ Valor inválido! Digite apenas números.',
          ephemeral: true
        });
      }

      const loanId = `loan_${Date.now()}_${userId}`;
      const loanData = {
        id: loanId,
        guildId: guildId,
        userId: userId,
        userTag: interaction.user.tag,
        valor: valor,
        status: 'pendente',
        timestamp: Date.now()
      };

      if (!global.pendingLoans) global.pendingLoans = new Map();
      global.pendingLoans.set(loanId, loanData);

      console.log(`[Finance] Loan request ${loanId} created by ${userId} for ${valor} (Guild: ${guildId})`);

      const canalFinanceiro = interaction.guild.channels.cache.find(c => c.name === '📊╠financeiro');
      if (!canalFinanceiro) {
        return interaction.reply({
          content: '❌ Canal financeiro não encontrado!',
          ephemeral: true
        });
      }

      const embed = new EmbedBuilder()
        .setTitle('💳 SOLICITAÇÃO DE EMPRÉSTIMO')
        .setDescription(
          `**Jogador:** <@${userId}> (${interaction.user.tag})\n` +
          `**Valor Solicitado:** \`${valor.toLocaleString()}\`\n` +
          `**Servidor:** ${interaction.guild.name}`
        )
        .setColor(0x3498DB)
        .setTimestamp();

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`fin_confirmar_emprestimo_${loanId}`)
            .setLabel('✅ Aprovar Empréstimo')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`fin_recusar_emprestimo_${loanId}`)
            .setLabel('❌ Recusar Empréstimo')
            .setStyle(ButtonStyle.Danger)
        );

      const admRole = interaction.guild.roles.cache.find(r => r.name === 'ADM');
      const staffRole = interaction.guild.roles.cache.find(r => r.name === 'Staff');
      const tesoureiroRole = interaction.guild.roles.cache.find(r => r.name === 'tesoureiro');

      let mentions = '';
      if (tesoureiroRole) mentions += `<@&${tesoureiroRole.id}> `;
      if (admRole) mentions += `<@&${admRole.id}> `;
      if (staffRole) mentions += `<@&${staffRole.id}>`;

      await canalFinanceiro.send({
        content: mentions ? `🔔 ${mentions} Nova solicitação de empréstimo!` : '🔔 Nova solicitação de empréstimo!',
        embeds: [embed],
        components: [botoes]
      });

      await interaction.reply({
        content: `✅ Solicitação de empréstimo de \`${valor.toLocaleString()}\` enviada para análise!`,
        ephemeral: true
      });

    } catch (error) {
      console.error(`[Finance] Error processing loan request:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar solicitação de empréstimo.',
        ephemeral: true
      });
    }
  }

  static async handleConfirmLoan(interaction, loanId) {
    try {
      console.log(`[Finance] Confirming loan ${loanId}`);

      const loan = global.pendingLoans?.get(loanId);
      if (!loan) {
        return interaction.reply({
          content: '❌ Solicitação de empréstimo não encontrada!',
          ephemeral: true
        });
      }

      const guildId = interaction.guild.id;

      // Verificar se é do mesmo servidor
      if (loan.guildId && loan.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Esta solicitação é de outro servidor!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');
      const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro');

      if (!isADM && !isStaff && !isTesoureiro) {
        return interaction.reply({
          content: '❌ Apenas ADM, Staff ou Tesoureiro podem aprovar empréstimos!',
          ephemeral: true
        });
      }

      await Database.addSaldo(guildId, loan.userId, loan.valor, 'emprestimo_aprovado');
      const user = await Database.getUser(guildId, loan.userId);
      const novaDivida = (user.emprestimosPendentes || 0) + loan.valor;
      await Database.updateUser(guildId, loan.userId, { emprestimos_pendentes: novaDivida });

      loan.status = 'aprovado';
      loan.aprovadoPor = interaction.user.id;
      loan.aprovadoEm = Date.now();

      try {
        const user = await interaction.client.users.fetch(loan.userId);
        const userData = await Database.getUser(guildId, loan.userId);
        const novoSaldo = userData?.saldo || 0;
        const dividaTotal = userData?.emprestimosPendentes || loan.valor;

        const embed = new EmbedBuilder()
          .setTitle('✅ EMPRÉSTIMO APROVADO')
          .setDescription(
            `💳 **Crédito Liberado!**\n\n` +
            `> **Valor do Empréstimo:** \`${loan.valor.toLocaleString()}\`\n` +
            `> **Aprovado por:** \`${interaction.user.tag}\`\n` +
            `> **Data:** ${new Date().toLocaleString('pt-BR')}\n` +
            `> **Servidor:** ${interaction.guild.name}\n\n` +
            `💰 **Novo Saldo:** \`${novoSaldo.toLocaleString()}\`\n` +
            `📊 **Dívida Total:** \`${dividaTotal.toLocaleString()}\`\n\n` +
            `⚠️ *Lembre-se de quitar seu empréstimo assim que possível!*`
          )
          .setColor(0x3498DB)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        await user.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[Finance] Could not DM user ${loan.userId}`);
      }

      await interaction.update({
        content: `✅ Empréstimo de \`${loan.valor.toLocaleString()}\` aprovado para ${loan.userTag}!`,
        components: []
      });

      const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
      if (canalLogs) {
        await canalLogs.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📝 LOG: EMPRÉSTIMO APROVADO')
              .setDescription(
                `**Jogador:** <@${loan.userId}>\n` +
                `**Valor:** \`${loan.valor.toLocaleString()}\`\n` +
                `**Aprovado por:** <@${interaction.user.id}>\n` +
                `**Servidor:** ${interaction.guild.name}`
              )
              .setColor(0x3498DB)
              .setTimestamp()
          ]
        });
      }

    } catch (error) {
      console.error(`[Finance] Error confirming loan:`, error);
      await interaction.reply({
        content: '❌ Erro ao aprovar empréstimo.',
        ephemeral: true
      });
    }
  }

  static async handleRejectLoan(interaction, loanId) {
    try {
      console.log(`[Finance] Rejecting loan ${loanId}`);

      const loan = global.pendingLoans?.get(loanId);
      if (!loan) {
        return interaction.reply({
          content: '❌ Solicitação não encontrada!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (loan.guildId && loan.guildId !== interaction.guild.id) {
        return interaction.reply({
          content: '❌ Esta solicitação é de outro servidor!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');
      const isTesoureiro = interaction.member.roles.cache.some(r => r.name === 'tesoureiro');

      if (!isADM && !isStaff && !isTesoureiro) {
        return interaction.reply({
          content: '❌ Sem permissão!',
          ephemeral: true
        });
      }

      loan.status = 'recusado';
      loan.recusadoPor = interaction.user.id;

      try {
        const user = await interaction.client.users.fetch(loan.userId);

        const embed = new EmbedBuilder()
          .setTitle('❌ EMPRÉSTIMO RECUSADO')
          .setDescription(
            `⚠️ **Sua solicitação de empréstimo foi recusada.**\n\n` +
            `> **Valor Solicitado:** \`${loan.valor.toLocaleString()}\`\n` +
            `> **Recusado por:** \`${interaction.user.tag}\`\n` +
            `> **Servidor:** ${interaction.guild.name}\n\n` +
            `💡 *Entre em contato com a administração para mais informações.*`
          )
          .setColor(0xE74C3C)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        await user.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[Finance] Could not DM user ${loan.userId}`);
      }

      await interaction.update({
        content: `❌ Empréstimo recusado.`,
        components: []
      });

    } catch (error) {
      console.error(`[Finance] Error rejecting loan:`, error);
      await interaction.reply({
        content: '❌ Erro ao recusar empréstimo.',
        ephemeral: true
      });
    }
  }

  // ==================== TRANSFERÊNCIA ====================

  static async processTransferRequest(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;
      const userIdDestino = interaction.fields.getTextInputValue('id_usuario').trim();
      const valorInput = interaction.fields.getTextInputValue('valor_transferencia').trim();
      const comentario = interaction.fields.getTextInputValue('comentario_transferencia')?.trim() || 'Sem motivo especificado';

      const valorLimpo = valorInput.replace(/\./g, '').replace(/,/g, '');
      const valor = parseInt(valorLimpo);

      if (isNaN(valor) || valor <= 0) {
        return interaction.reply({
          content: '❌ Valor inválido!',
          ephemeral: true
        });
      }

      if (!/^\d{17,19}$/.test(userIdDestino)) {
        return interaction.reply({
          content: '❌ ID de usuário inválido! Deve ter 17-19 dígitos.',
          ephemeral: true
        });
      }

      if (userIdDestino === userId) {
        return interaction.reply({
          content: '❌ Você não pode transferir para si mesmo!',
          ephemeral: true
        });
      }

      const userOrigem = await Database.getUser(guildId, userId);
      if (!userOrigem || userOrigem.saldo === undefined) {
        return interaction.reply({
          content: '❌ Erro ao consultar seu saldo. Tente novamente mais tarde.',
          ephemeral: true
        });
      }

      if (userOrigem.saldo < valor) {
        return interaction.reply({
          content: `❌ Saldo insuficiente! Você tem \`${userOrigem.saldo.toLocaleString()}\`.`,
          ephemeral: true
        });
      }

      let destinoTag = 'Usuário não encontrado';
      try {
        const destinoUser = await interaction.client.users.fetch(userIdDestino);
        destinoTag = destinoUser.tag;
      } catch (e) {
        return interaction.reply({
          content: '❌ Usuário destino não encontrado no Discord!',
          ephemeral: true
        });
      }

      const transferId = `transf_${Date.now()}_${userId}`;
      const transferData = {
        id: transferId,
        guildId: guildId,
        fromId: userId,
        fromTag: interaction.user.tag,
        toId: userIdDestino,
        toTag: destinoTag,
        valor: valor,
        comentario: comentario,
        status: 'pendente',
        timestamp: Date.now()
      };

      if (!global.pendingTransfers) global.pendingTransfers = new Map();
      global.pendingTransfers.set(transferId, transferData);

      console.log(`[Finance] Transfer request ${transferId} from ${userId} to ${userIdDestino} (Guild: ${guildId})`);

      // DM para destino
      try {
        const destinoUser = await interaction.client.users.fetch(userIdDestino);

        const embed = new EmbedBuilder()
          .setTitle('🔄 SOLICITAÇÃO DE TRANSFERÊNCIA')
          .setDescription(
            `💸 **Você recebeu uma proposta de transferência!**\n\n` +
            `> **De:** \`${interaction.user.tag}\`\n` +
            `> **Valor:** \`${valor.toLocaleString()}\`\n` +
            `> **Motivo:** \`\`\`${comentario}\`\`\`\n\n` +
            `🤔 *Aceitar ou recusar esta transferência?*`
          )
          .setColor(0xF1C40F)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        const botoes = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId(`transf_aceitar_${transferId}`)
              .setLabel('✅ Aceitar')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(`transf_recusar_${transferId}`)
              .setLabel('❌ Recusar')
              .setStyle(ButtonStyle.Danger)
          );

        await destinoUser.send({
          embeds: [embed],
          components: [botoes]
        });

        await interaction.reply({
          content: `✅ Solicitação de transferência enviada para ${destinoTag}!\n📝 **Motivo:** \`${comentario}\`\nAguarde confirmação.`,
          ephemeral: true
        });

      } catch (e) {
        console.log(`[Finance] Could not DM destination user ${userIdDestino}`);
        await interaction.reply({
          content: '❌ Não foi possível enviar mensagem para o usuário destino. Verifique se ele permite DMs.',
          ephemeral: true
        });
      }

    } catch (error) {
      console.error(`[Finance] Error processing transfer request:`, error);
      await interaction.reply({
        content: '❌ Erro ao processar transferência.',
        ephemeral: true
      });
    }
  }

  static async handleAcceptTransfer(interaction, transferId) {
    try {
      console.log(`[Finance] Accepting transfer ${transferId}`);

      const transfer = global.pendingTransfers?.get(transferId);
      if (!transfer) {
        return interaction.reply({
          content: '❌ Transferência não encontrada ou expirada!',
          ephemeral: true
        });
      }

      if (interaction.user.id !== transfer.toId) {
        return interaction.reply({
          content: '❌ Você não é o destinatário desta transferência!',
          ephemeral: true
        });
      }

      const guildId = transfer.guildId;

      const userOrigem = await Database.getUser(guildId, transfer.fromId);
      if (!userOrigem || userOrigem.saldo < transfer.valor) {
        return interaction.reply({
          content: '❌ O remetente não possui saldo suficiente mais!',
          ephemeral: true
        });
      }

      await Database.removeSaldo(guildId, transfer.fromId, transfer.valor, 'transferencia_enviada');
      await Database.addSaldo(guildId, transfer.toId, transfer.valor, 'transferencia_recebida');

      transfer.status = 'concluida';
      transfer.dataAceite = Date.now();

      // DM para origem
      try {
        const origemUser = await interaction.client.users.fetch(transfer.fromId);

        const embed = new EmbedBuilder()
          .setTitle('✅ TRANSFERÊNCIA CONCLUÍDA')
          .setDescription(
            `🎉 **Sua transferência foi aceita!**\n\n` +
            `> **Para:** \`${interaction.user.tag}\`\n` +
            `> **Valor:** \`${transfer.valor.toLocaleString()}\`\n` +
            `> **Motivo:** \`\`\`${transfer.comentario}\`\`\`\n` +
            `> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
            `💰 O valor já foi debitado da sua conta.`
          )
          .setColor(0x2ECC71)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        await origemUser.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[Finance] Could not notify origin user ${transfer.fromId}`);
      }

      // DM para quem aceitou
      const embedAceite = new EmbedBuilder()
        .setTitle('✅ TRANSFERÊNCIA RECEBIDA')
        .setDescription(
          `💰 **Você aceitou a transferência!**\n\n` +
          `> **De:** \`${transfer.fromTag}\`\n` +
          `> **Valor Recebido:** \`${transfer.valor.toLocaleString()}\`\n` +
          `> **Motivo:** \`\`\`${transfer.comentario}\`\`\`\n` +
          `> **Data:** ${new Date().toLocaleString('pt-BR')}`
        )
        .setColor(0x2ECC71)
        .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
        .setTimestamp();

      await interaction.update({
        content: '',
        embeds: [embedAceite],
        components: []
      });

      // Log
      const guild = interaction.client.guilds.cache.get(guildId);
      if (guild) {
        const canalLogs = guild.channels.cache.find(c => c.name === '📜╠logs-banco');
        if (canalLogs) {
          await canalLogs.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('📝 LOG: TRANSFERÊNCIA')
                .setDescription(
                  `**De:** <@${transfer.fromId}>\n` +
                  `**Para:** <@${transfer.toId}>\n` +
                  `**Valor:** \`${transfer.valor.toLocaleString()}\`\n` +
                  `**Motivo:** \`${transfer.comentario}\`\n` +
                  `**Servidor:** ${guild.name}`
                )
                .setColor(0x95A5A6)
                .setTimestamp()
            ]
          });
        }
      }

    } catch (error) {
      console.error(`[Finance] Error accepting transfer:`, error);
      await interaction.reply({
        content: '❌ Erro ao aceitar transferência.',
        ephemeral: true
      });
    }
  }

  static async handleRejectTransfer(interaction, transferId) {
    try {
      console.log(`[Finance] Rejecting transfer ${transferId}`);

      const transfer = global.pendingTransfers?.get(transferId);
      if (!transfer) {
        return interaction.reply({
          content: '❌ Transferência não encontrada!',
          ephemeral: true
        });
      }

      if (interaction.user.id !== transfer.toId) {
        return interaction.reply({
          content: '❌ Você não é o destinatário desta transferência!',
          ephemeral: true
        });
      }

      transfer.status = 'recusada';

      // DM para origem
      try {
        const origemUser = await interaction.client.users.fetch(transfer.fromId);

        const embed = new EmbedBuilder()
          .setTitle('❌ TRANSFERÊNCIA RECUSADA')
          .setDescription(
            `⚠️ **Sua transferência foi recusada.**\n\n` +
            `> **Para:** \`${interaction.user.tag}\`\n` +
            `> **Valor:** \`${transfer.valor.toLocaleString()}\`\n` +
            `> **Motivo Original:** \`${transfer.comentario}\`\n\n` +
            `💡 O valor não foi debitado da sua conta.`
          )
          .setColor(0xE74C3C)
          .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
          .setTimestamp();

        await origemUser.send({ embeds: [embed] });
      } catch (e) {
        console.log(`[Finance] Could not notify origin user ${transfer.fromId}`);
      }

      // DM para quem recusou
      const embedRecusa = new EmbedBuilder()
        .setTitle('❌ TRANSFERÊNCIA RECUSADA')
        .setDescription(
          `🚫 **Você recusou a transferência.**\n\n` +
          `> **De:** \`${transfer.fromTag}\`\n` +
          `> **Valor:** \`${transfer.valor.toLocaleString()}\`\n` +
          `> **Motivo:** \`${transfer.comentario}\``
        )
        .setColor(0xE74C3C)
        .setFooter({ text: 'NOTAG Bot • Sistema Financeiro' })
        .setTimestamp();

      await interaction.update({
        content: '',
        embeds: [embedRecusa],
        components: []
      });

    } catch (error) {
      console.error(`[Finance] Error rejecting transfer:`, error);
      await interaction.reply({
        content: '❌ Erro ao recusar transferência.',
        ephemeral: true
      });
    }
  }

  // ==================== CONSULTAR SALDO ====================

  static async sendBalanceInfo(user, guildId) {
    try {
      const userData = await Database.getUser(guildId, user.id);

      if (!userData) {
        console.error(`[Finance] User data not found for ${user.id} in guild ${guildId}`);
        throw new Error('Dados do usuário não encontrados');
      }

      const saldo = userData.saldo || 0;
      const emprestimosPendentes = userData.emprestimosPendentes || 0;
      const saldoLiquido = saldo - emprestimosPendentes;
      const totalRecebido = userData.totalRecebido || 0;
      const totalSacado = userData.totalSacado || 0;
      const totalEmprestimos = userData.totalEmprestimos || 0;

      const embed = new EmbedBuilder()
        .setTitle('💰 SEU SALDO')
        .setDescription(
          `📊 **Resumo Financeiro Completo**\n\n` +
          `💵 **Saldo Bruto:** \`\`\`${saldo.toLocaleString()}\`\`\`\n` +
          `📉 **Empréstimos Pendentes:** \`\`\`${emprestimosPendentes.toLocaleString()}\`\`\`\n` +
          `✨ **Saldo Líquido:** \`\`\`${saldoLiquido.toLocaleString()}\`\`\`\n\n` +
          `📈 **Estatísticas:**\n` +
          `> Total Recebido: \`${totalRecebido.toLocaleString()}\`\n` +
          `> Total Sacado: \`${totalSacado.toLocaleString()}\`\n` +
          `> Total em Empréstimos: \`${totalEmprestimos.toLocaleString()}\``
        )
        .setColor(0x2ECC71)
        .setFooter({
          text: `NOTAG Bot • Sistema Financeiro • ${new Date().toLocaleDateString('pt-BR')}`
        })
        .setTimestamp();

      const percentualSaque = totalRecebido > 0
        ? Math.round((totalSacado / totalRecebido) * 100)
        : 0;

      embed.addFields({
        name: '📊 Movimentação',
        value: `Saque/Recebimento: \`${percentualSaque}%\``,
        inline: false
      });

      await user.send({ embeds: [embed] });
      console.log(`[Finance] Balance info sent to ${user.id} (Guild: ${guildId})`);
    } catch (error) {
      console.error(`[Finance] Error sending balance info:`, error);
      throw error;
    }
  }
}

module.exports = FinanceHandler;