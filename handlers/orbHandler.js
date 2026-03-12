const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder
} = require('discord.js');
const Database = require('../utils/database');

/**
 * Handler de Orb - Versão Multi-Servidor
 * Gerencia depósitos de Orbs de Fame
 */
class OrbHandler {

  static async sendPanel(channel) {
    try {
      const embed = new EmbedBuilder()
        .setTitle('🔮 SISTEMA DE ORBS')
        .setDescription(
          'Sistema de gerenciamento de Orbs de Fame!\n\n' +
          'Aqui você pode depositar orbs e acompanhar suas transações.\n\n' +
          '💡 **Os orbs são específicos de cada servidor.**'
        )
        .setColor(0x9B59B6)
        .addFields(
          {
            name: '💰 Consultar Saldo',
            value: 'Verifique seu saldo de orbs',
            inline: true
          },
          {
            name: '➕ Depositar Orbs',
            value: 'Adicione orbs à sua conta',
            inline: true
          }
        )
        .setFooter({ text: 'NOTAG Bot • Sistema de Orbs' })
        .setTimestamp();

      const buttons = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('btn_consultar_orb')
            .setLabel('💰 Meu Saldo')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('btn_depositar_orb')
            .setLabel('➕ Depositar Orbs')
            .setStyle(ButtonStyle.Success)
        );

      await channel.send({ embeds: [embed], components: [buttons] });
      console.log(`[OrbHandler] Painel de orbs enviado em #${channel.name}`);

    } catch (error) {
      console.error('[OrbHandler] Erro ao enviar painel:', error);
      throw error;
    }
  }

  static async showUserSelect(interaction) {
    try {
      const guildId = interaction.guild.id;

      // Inicializar temp data
      if (!global.orbTemp) global.orbTemp = new Map();

      global.orbTemp.set(interaction.user.id, {
        guildId: guildId,
        users: [],
        step: 'selecting'
      });

      const embed = new EmbedBuilder()
        .setTitle('🔮 SELECIONAR DESTINATÁRIO(S)')
        .setDescription(
          '**Como funciona:**\n\n' +
          '1️⃣ Clique em **"Selecionar Jogador(es)"**\n' +
          '2️⃣ Você pode selecionar **até 25 jogadores**\n' +
          '3️⃣ Defina a quantidade de orbs\n\n' +
          '💡 **O depósito de orbs requer aprovação de ADM/Staff.**'
        )
        .setColor(0x9B59B6);

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('orb_select_users')
            .setLabel('👥 Selecionar Jogador(es)')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('orb_clear_users')
            .setLabel('🗑️ Limpar')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.reply({
        embeds: [embed],
        components: [botoes],
        ephemeral: true
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao abrir seleção:', error);
      await interaction.reply({
        content: '❌ Erro ao abrir formulário.',
        ephemeral: true
      });
    }
  }

  static async openUserSelection(interaction) {
    try {
      const row = new ActionRowBuilder()
        .addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('select_orb_users')
            .setPlaceholder('🔍 Pesquise e selecione os jogadores...')
            .setMinValues(1)
            .setMaxValues(25)
        );

      await interaction.reply({
        content: '🔍 **Selecione os jogadores que receberão orbs:**',
        components: [row],
        ephemeral: true
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao abrir UserSelectMenu:', error);
    }
  }

  static async processUserSelection(interaction) {
    try {
      const guildId = interaction.guild.id;
      const selectedUsers = interaction.values;

      if (!global.orbTemp) global.orbTemp = new Map();

      const tempData = global.orbTemp.get(interaction.user.id) || {
        guildId: guildId,
        users: [],
        step: 'selecting'
      };

      // Verificar se é do mesmo servidor
      if (tempData.guildId && tempData.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Erro: Dados de outro servidor detectados.',
          ephemeral: true
        });
      }

      // Adicionar novos usuários
      const existingUsers = new Set(tempData.users);
      selectedUsers.forEach(id => existingUsers.add(id));
      tempData.users = Array.from(existingUsers);

      global.orbTemp.set(interaction.user.id, tempData);

      const mentions = tempData.users.map(id => `<@${id}>`).join(', ');

      const embed = new EmbedBuilder()
        .setTitle('👥 JOGADORES SELECIONADOS')
        .setDescription(
          `✅ **${tempData.users.length} jogador(es) selecionado(s):**\n${mentions}\n\n` +
          'Clique em **"Prosseguir"** para definir a quantidade de orbs.'
        )
        .setColor(0x9B59B6);

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('orb_proceed_to_modal')
            .setLabel('➡️ Prosseguir')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('orb_select_users')
            .setLabel('➕ Adicionar Mais')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('orb_clear_users')
            .setLabel('🗑️ Limpar')
            .setStyle(ButtonStyle.Secondary)
        );

      await interaction.update({
        content: null,
        embeds: [embed],
        components: [botoes]
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao processar seleção:', error);
    }
  }

  static async clearUserSelection(interaction) {
    try {
      if (!global.orbTemp) global.orbTemp = new Map();

      const tempData = global.orbTemp.get(interaction.user.id);
      if (tempData) {
        tempData.users = [];
        global.orbTemp.set(interaction.user.id, tempData);
      }

      await interaction.update({
        content: '🗑️ **Seleção limpa!**',
        embeds: [],
        components: [
          new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId('orb_select_users')
                .setLabel('👥 Selecionar Jogador(es)')
                .setStyle(ButtonStyle.Primary)
            )
        ]
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao limpar seleção:', error);
    }
  }

  static async openOrbModal(interaction) {
    try {
      const tempData = global.orbTemp?.get(interaction.user.id);

      if (!tempData || tempData.users.length === 0) {
        return interaction.reply({
          content: '❌ Nenhum jogador selecionado!',
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId('modal_depositar_orb_multi')
        .setTitle(`🔮 Orbs para ${tempData.users.length} jogador(es)`);

      const quantidadeInput = new TextInputBuilder()
        .setCustomId('quantidade_orb')
        .setLabel('Quantidade de Orbs')
        .setPlaceholder('Ex: 100')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

      const motivoInput = new TextInputBuilder()
        .setCustomId('motivo_orb')
        .setLabel('Motivo (opcional)')
        .setPlaceholder('Ex: Compra de itens, premiação, etc.')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(200);

      modal.addComponents(
        new ActionRowBuilder().addComponents(quantidadeInput),
        new ActionRowBuilder().addComponents(motivoInput)
      );

      await interaction.showModal(modal);

    } catch (error) {
      console.error('[OrbHandler] Erro ao abrir modal:', error);
    }
  }

  static async processOrbDeposit(interaction) {
    try {
      const guildId = interaction.guild.id;
      const quantidadeInput = interaction.fields.getTextInputValue('quantidade_orb').trim();
      const motivo = interaction.fields.getTextInputValue('motivo_orb') || 'Depósito de orbs';

      const quantidade = parseInt(quantidadeInput.replace(/\./g, '').replace(/,/g, ''));

      if (isNaN(quantidade) || quantidade <= 0) {
        return interaction.reply({
          content: '❌ Quantidade inválida! Digite apenas números.',
          ephemeral: true
        });
      }

      const tempData = global.orbTemp?.get(interaction.user.id);

      if (!tempData || tempData.users.length === 0) {
        return interaction.reply({
          content: '❌ Nenhum jogador selecionado!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (tempData.guildId && tempData.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Dados de outro servidor detectados!',
          ephemeral: true
        });
      }

      const userIds = tempData.users;
      const depositId = `orb_${Date.now()}_${interaction.user.id}`;

      // Criar solicitação de aprovação
      if (!global.pendingOrbDeposits) global.pendingOrbDeposits = new Map();
      global.pendingOrbDeposits.set(depositId, {
        id: depositId,
        guildId: guildId,
        fromUserId: interaction.user.id,
        fromUserTag: interaction.user.tag,
        toUserIds: userIds,
        quantidade: quantidade,
        motivo: motivo,
        timestamp: Date.now()
      });

      // Enviar para aprovação do financeiro
      const canalFinanceiro = interaction.guild.channels.cache.find(c => c.name === '📊╠financeiro');
      if (!canalFinanceiro) {
        return interaction.reply({
          content: '❌ Canal financeiro não encontrado!',
          ephemeral: true
        });
      }

      const mentions = userIds.map(id => `<@${id}>`).join(', ');

      const embed = new EmbedBuilder()
        .setTitle('🔮 SOLICITAÇÃO DE DEPÓSITO DE ORBS')
        .setDescription(
          `**Solicitante:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
          `**Quantidade:** \`${quantidade.toLocaleString()}\` orbs\n` +
          `**Motivo:** ${motivo}\n` +
          `**Destinatários:** ${mentions}\n` +
          `**Servidor:** ${interaction.guild.name}`
        )
        .setColor(0x9B59B6)
        .setTimestamp();

      const botoes = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`orb_approve_${depositId}`)
            .setLabel('✅ Aprovar')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(`orb_reject_${depositId}`)
            .setLabel('❌ Recusar')
            .setStyle(ButtonStyle.Danger)
        );

      const admRole = interaction.guild.roles.cache.find(r => r.name === 'ADM');
      const staffRole = interaction.guild.roles.cache.find(r => r.name === 'Staff');

      let mentionsRole = '';
      if (admRole) mentionsRole += `<@&${admRole.id}> `;
      if (staffRole) mentionsRole += `<@&${staffRole.id}>`;

      await canalFinanceiro.send({
        content: mentionsRole ? `🔔 ${mentionsRole} Nova solicitação de orbs!` : '🔔 Nova solicitação de orbs!',
        embeds: [embed],
        components: [botoes]
      });

      // Limpar temp
      global.orbTemp.delete(interaction.user.id);

      await interaction.reply({
        content: `✅ Solicitação de \`${quantidade.toLocaleString()}\` orbs enviada para aprovação!\n\n⏳ Aguarde aprovação do financeiro.`,
        ephemeral: true
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao processar depósito:', error);
      await interaction.reply({
        content: '❌ Erro ao processar depósito de orbs.',
        ephemeral: true
      });
    }
  }

  static async approveOrb(interaction, depositId) {
    try {
      const guildId = interaction.guild.id;
      const deposit = global.pendingOrbDeposits?.get(depositId);

      if (!deposit) {
        return interaction.reply({
          content: '❌ Solicitação não encontrada ou já processada!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (deposit.guildId && deposit.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Esta solicitação é de outro servidor!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

      if (!isADM && !isStaff) {
        return interaction.reply({
          content: '❌ Apenas ADM ou Staff podem aprovar!',
          ephemeral: true
        });
      }

      let sucessos = 0;
      let falhas = 0;

      // Adicionar orbs para cada usuário (usando saldo como orbs)
      for (const userId of deposit.toUserIds) {
        try {
          // Usando addSaldo como orbs (mesmo sistema, moeda diferente)
          await Database.addSaldo(
            guildId,
            userId,
            deposit.quantidade,
            `Orbs: ${deposit.motivo} (por ${deposit.fromUserTag})`
          );
          sucessos++;

          // Notificar destinatário
          try {
            const user = await interaction.client.users.fetch(userId);
            const embedDM = new EmbedBuilder()
              .setTitle('🔮 ORBS RECEBIDOS!')
              .setDescription(
                `🎉 **Você recebeu orbs!**\n\n` +
                `💎 **Quantidade:** \`${deposit.quantidade.toLocaleString()}\`\n` +
                `📝 **Motivo:** ${deposit.motivo}\n` +
                `👤 **De:** ${deposit.fromUserTag}\n` +
                `🏰 **Servidor:** ${interaction.guild.name}\n` +
                `✅ **Aprovado por:** ${interaction.user.tag}`
              )
              .setColor(0x9B59B6)
              .setTimestamp();

            await user.send({ embeds: [embedDM] });
          } catch (e) {
            console.log(`[OrbHandler] Não foi possível notificar ${userId}`);
          }

        } catch (e) {
          console.error(`[OrbHandler] Erro ao adicionar orbs para ${userId}:`, e);
          falhas++;
        }
      }

      global.pendingOrbDeposits.delete(depositId);

      const embedResultado = new EmbedBuilder()
        .setTitle('✅ ORBS APROVADOS')
        .setDescription(
          `🔮 **Quantidade:** \`${deposit.quantidade.toLocaleString()}\` orbs\n` +
          `👥 **Jogadores:** ${sucessos}/${deposit.toUserIds.length}\n` +
          `✅ **Aprovado por:** ${interaction.user.tag}\n` +
          `🏰 **Servidor:** ${interaction.guild.name}`
        )
        .setColor(0x2ECC71)
        .setTimestamp();

      await interaction.update({
        content: '',
        embeds: [embedResultado],
        components: []
      });

      // Log
      const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
      if (canalLogs) {
        await canalLogs.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📝 LOG: ORBS APROVADOS')
              .setDescription(
                `**De:** ${deposit.fromUserTag}\n` +
                `**Quantidade:** \`${deposit.quantidade.toLocaleString()}\`\n` +
                `**Jogadores:** ${sucessos}\n` +
                `**Aprovado por:** <@${interaction.user.id}>\n` +
                `**Servidor:** ${interaction.guild.name}`
              )
              .setColor(0x9B59B6)
              .setTimestamp()
          ]
        });
      }

    } catch (error) {
      console.error('[OrbHandler] Erro ao aprovar orbs:', error);
      await interaction.reply({
        content: '❌ Erro ao aprovar depósito.',
        ephemeral: true
      });
    }
  }

  static async rejectOrb(interaction, depositId) {
    try {
      const guildId = interaction.guild.id;
      const deposit = global.pendingOrbDeposits?.get(depositId);

      if (!deposit) {
        return interaction.reply({
          content: '❌ Solicitação não encontrada!',
          ephemeral: true
        });
      }

      // Verificar se é do mesmo servidor
      if (deposit.guildId && deposit.guildId !== guildId) {
        return interaction.reply({
          content: '❌ Esta solicitação é de outro servidor!',
          ephemeral: true
        });
      }

      const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
      const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

      if (!isADM && !isStaff) {
        return interaction.reply({
          content: '❌ Apenas ADM ou Staff podem recusar!',
          ephemeral: true
        });
      }

      global.pendingOrbDeposits.delete(depositId);

      // Notificar solicitante
      try {
        const solicitante = await interaction.client.users.fetch(deposit.fromUserId);
        const embedDM = new EmbedBuilder()
          .setTitle('❌ ORBS RECUSADOS')
          .setDescription(
            `⚠️ **Sua solicitação de orbs foi recusada.**\n\n` +
            `🔮 **Quantidade:** \`${deposit.quantidade.toLocaleString()}\`\n` +
            `📝 **Motivo:** ${deposit.motivo}\n` +
            `🏰 **Servidor:** ${interaction.guild.name}\n` +
            `❌ **Recusado por:** ${interaction.user.tag}`
          )
          .setColor(0xE74C3C)
          .setTimestamp();

        await solicitante.send({ embeds: [embedDM] });
      } catch (e) {
        console.log(`[OrbHandler] Não foi possível notificar solicitante`);
      }

      await interaction.update({
        content: `❌ Depósito de orbs recusado por ${interaction.user.tag}.`,
        embeds: [],
        components: []
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao recusar orbs:', error);
      await interaction.reply({
        content: '❌ Erro ao recusar depósito.',
        ephemeral: true
      });
    }
  }

  static async handleConsultarOrb(interaction) {
    try {
      const guildId = interaction.guild.id;
      const userId = interaction.user.id;

      // Orbs são tratados como saldo
      const saldo = await Database.getSaldo(guildId, userId);

      const embed = new EmbedBuilder()
        .setTitle('🔮 SEUS ORBS')
        .setDescription(
          `💎 **Saldo de Orbs:** \`${saldo.toLocaleString()}\`\n\n` +
          `🏰 **Servidor:** ${interaction.guild.name}\n\n` +
          `💡 Use o sistema de depósito para adicionar mais orbs.`
        )
        .setColor(0x9B59B6)
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });

    } catch (error) {
      console.error('[OrbHandler] Erro ao consultar orbs:', error);
      await interaction.reply({
        content: '❌ Erro ao consultar saldo de orbs.',
        ephemeral: true
      });
    }
  }
}

module.exports = OrbHandler;