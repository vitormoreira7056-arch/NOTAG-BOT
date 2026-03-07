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

class FinanceHandler {
 constructor() {
 this.pendingWithdrawals = new Map();
 this.pendingLoans = new Map();
 this.pendingTransfers = new Map();
 }

 // ========== Saque ==========
 static createWithdrawModal() {
 const modal = new ModalBuilder()
 .setCustomId('modal_sacar_saldo')
 .setTitle('💸 Solicitar Saque');

 const valorInput = new TextInputBuilder()
 .setCustomId('valor_saque')
 .setLabel('Valor que deseja sacar')
 .setPlaceholder('Ex: 100000')
 .setStyle(TextInputStyle.Short)
 .setRequired(true)
 .setMaxLength(12);

 modal.addComponents(new ActionRowBuilder().addComponents(valorInput));
 return modal;
 }

 static async processWithdrawRequest(interaction) {
 try {
 const valor = parseInt(interaction.fields.getTextInputValue('valor_saque'));

 if (isNaN(valor) || valor <= 0) {
 return interaction.reply({
 content: '❌ Valor inválido!',
 ephemeral: true
 });
 }

 const user = Database.getUser(interaction.user.id);

 if (user.saldo < valor) {
 return interaction.reply({
 content: `❌ Saldo insuficiente! Você tem \`${user.saldo.toLocaleString()}\` mas tentou sacar \`${valor.toLocaleString()}\`.`,
 ephemeral: true
 });
 }

 const withdrawalId = `wd_${Date.now()}_${interaction.user.id}`;
 const withdrawalData = {
 id: withdrawalId,
 userId: interaction.user.id,
 userTag: interaction.user.tag,
 valor: valor,
 saldoAtual: user.saldo,
 status: 'pendente',
 timestamp: Date.now()
 };

 if (!global.pendingWithdrawals) global.pendingWithdrawals = new Map();
 global.pendingWithdrawals.set(withdrawalId, withdrawalData);

 console.log(`[Finance] Withdrawal request ${withdrawalId} created by ${interaction.user.id} for ${valor}`);

 // Enviar para canal financeiro
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
 `**Jogador:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
 `**Valor Solicitado:** \`${valor.toLocaleString()}\`\n` +
 `**Saldo Atual:** \`${user.saldo.toLocaleString()}\`\n` +
 `**Saldo Após Saque:** \`${(user.saldo - valor).toLocaleString()}\``
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

 await canalFinanceiro.send({
 content: `🔔 <@&${interaction.guild.roles.cache.find(r => r.name === 'ADM')?.id}> <@&${interaction.guild.roles.cache.find(r => r.name === 'Staff')?.id}> Nova solicitação de saque!`,
 embeds: [embed],
 components: [botoes]
 });

 await interaction.reply({
 content: `✅ Solicitação de saque de \`${valor.toLocaleString()}\` enviada para análise! Aguarde aprovação no privado.`,
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

 const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
 const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

 if (!isADM && !isStaff) {
 return interaction.reply({
 content: '❌ Apenas ADM ou Staff podem confirmar saques!',
 ephemeral: true
 });
 }

 // Realizar débito
 Database.removeSaldo(withdrawal.userId, withdrawal.valor, 'saque_aprovado');

 withdrawal.status = 'aprovado';
 withdrawal.aprovadoPor = interaction.user.id;
 withdrawal.aprovadoEm = Date.now();

 // 🎨 DM MODERNA - Saque Aprovado
 try {
 const user = await interaction.client.users.fetch(withdrawal.userId);
 const novoSaldo = Database.getUser(withdrawal.userId).saldo;

 const embed = new EmbedBuilder()
 .setTitle('✅ SAQUE APROVADO')
 .setDescription(
 `💰 **Transação Concluída com Sucesso!**\n\n` +
 `> **Valor Sacado:** \`${withdrawal.valor.toLocaleString()}\`\n` +
 `> **Aprovado por:** \`${interaction.user.tag}\`\n` +
 `> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
 `💳 **Novo Saldo:** \`${novoSaldo.toLocaleString()}\``
 )
 .setColor(0x2ECC71)
 .setThumbnail('https://i.imgur.com/5K9Q5ZK.png') // Ícone de moedas
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/8QBYRrm.png' 
 })
 .setTimestamp();

 await user.send({ embeds: [embed] });
 } catch (e) {
 console.log(`[Finance] Could not DM user ${withdrawal.userId}`);
 }

 await interaction.update({
 content: `✅ Saque de \`${withdrawal.valor.toLocaleString()}\` aprovado para ${withdrawal.userTag}!`,
 components: []
 });

 // Log
 const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
 if (canalLogs) {
 await canalLogs.send({
 embeds: [
 new EmbedBuilder()
 .setTitle('📝 LOG: SAQUE APROVADO')
 .setDescription(
 `**Jogador:** <@${withdrawal.userId}>\n` +
 `**Valor:** \`${withdrawal.valor.toLocaleString()}\`\n` +
 `**Aprovado por:** <@${interaction.user.id}>`
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

 withdrawal.status = 'recusado';
 withdrawal.motivoRecusa = motivo;
 withdrawal.recusadoPor = interaction.user.id;

 // 🎨 DM MODERNA - Saque Recusado
 try {
 const user = await interaction.client.users.fetch(withdrawal.userId);

 const embed = new EmbedBuilder()
 .setTitle('❌ SAQUE RECUSADO')
 .setDescription(
 `⚠️ **Sua solicitação de saque foi recusada.**\n\n` +
 `> **Valor Solicitado:** \`${withdrawal.valor.toLocaleString()}\`\n` +
 `> **Motivo:** \`\`\`${motivo}\`\`\`\n` +
 `> **Recusado por:** \`${interaction.user.tag}\`\n\n` +
 `💡 *Se você tiver dúvidas, entre em contato com um administrador.*`
 )
 .setColor(0xE74C3C)
 .setThumbnail('https://i.imgur.com/8QBYRrm.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/5K9Q5ZK.png' 
 })
 .setTimestamp();

 await user.send({ embeds: [embed] });
 } catch (e) {
 console.log(`[Finance] Could not DM user ${withdrawal.userId}`);
 }

 await interaction.reply({
 content: `❌ Saque recusado. Motivo enviado para o jogador.`,
 ephemeral: true
 });

 // Atualizar mensagem original
 const message = interaction.message;
 if (message) {
 await message.edit({
 content: `❌ SAQUE RECUSADO por ${interaction.user.tag}\n**Motivo:** ${motivo}`,
 components: []
 });
 }

 } catch (error) {
 console.error(`[Finance] Error processing rejection:`, error);
 await interaction.reply({
 content: '❌ Erro ao processar recusa.',
 ephemeral: true
 });
 }
 }

 // ========== Empréstimo ==========
 static createLoanModal() {
 const modal = new ModalBuilder()
 .setCustomId('modal_solicitar_emprestimo')
 .setTitle('💳 Solicitar Empréstimo');

 const valorInput = new TextInputBuilder()
 .setCustomId('valor_emprestimo')
 .setLabel('Valor que deseja pegar emprestado')
 .setPlaceholder('Ex: 500000')
 .setStyle(TextInputStyle.Short)
 .setRequired(true)
 .setMaxLength(12);

 modal.addComponents(new ActionRowBuilder().addComponents(valorInput));
 return modal;
 }

 static async processLoanRequest(interaction) {
 try {
 const valor = parseInt(interaction.fields.getTextInputValue('valor_emprestimo'));

 if (isNaN(valor) || valor <= 0) {
 return interaction.reply({
 content: '❌ Valor inválido!',
 ephemeral: true
 });
 }

 const loanId = `loan_${Date.now()}_${interaction.user.id}`;
 const loanData = {
 id: loanId,
 userId: interaction.user.id,
 userTag: interaction.user.tag,
 valor: valor,
 status: 'pendente',
 timestamp: Date.now()
 };

 if (!global.pendingLoans) global.pendingLoans = new Map();
 global.pendingLoans.set(loanId, loanData);

 console.log(`[Finance] Loan request ${loanId} created by ${interaction.user.id} for ${valor}`);

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
 `**Jogador:** <@${interaction.user.id}> (${interaction.user.tag})\n` +
 `**Valor Solicitado:** \`${valor.toLocaleString()}\``
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

 await canalFinanceiro.send({
 content: `🔔 <@&${interaction.guild.roles.cache.find(r => r.name === 'ADM')?.id}> <@&${interaction.guild.roles.cache.find(r => r.name === 'Staff')?.id}> Nova solicitação de empréstimo!`,
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

 const isADM = interaction.member.roles.cache.some(r => r.name === 'ADM');
 const isStaff = interaction.member.roles.cache.some(r => r.name === 'Staff');

 if (!isADM && !isStaff) {
 return interaction.reply({
 content: '❌ Apenas ADM ou Staff podem aprovar empréstimos!',
 ephemeral: true
 });
 }

 // Adicionar saldo e registrar dívida
 Database.addSaldo(loan.userId, loan.valor, 'emprestimo_aprovado');
 Database.addLoan(loan.userId, loan.valor);

 loan.status = 'aprovado';
 loan.aprovadoPor = interaction.user.id;
 loan.aprovadoEm = Date.now();

 // 🎨 DM MODERNA - Empréstimo Aprovado
 try {
 const user = await interaction.client.users.fetch(loan.userId);
 const novoSaldo = Database.getUser(loan.userId).saldo;
 const dividaTotal = Database.getUser(loan.userId).emprestimosPendentes || loan.valor;

 const embed = new EmbedBuilder()
 .setTitle('✅ EMPRÉSTIMO APROVADO')
 .setDescription(
 `💳 **Crédito Liberado!**\n\n` +
 `> **Valor do Empréstimo:** \`${loan.valor.toLocaleString()}\`\n` +
 `> **Aprovado por:** \`${interaction.user.tag}\`\n` +
 `> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
 `💰 **Novo Saldo:** \`${novoSaldo.toLocaleString()}\`\n` +
 `📊 **Dívida Total:** \`${dividaTotal.toLocaleString()}\`\n\n` +
 `⚠️ *Lembre-se de quitar seu empréstimo assim que possível!*`
 )
 .setColor(0x3498DB)
 .setThumbnail('https://i.imgur.com/8QBYRrm.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/5K9Q5ZK.png' 
 })
 .setTimestamp();

 await user.send({ embeds: [embed] });
 } catch (e) {
 console.log(`[Finance] Could not DM user ${loan.userId}`);
 }

 await interaction.update({
 content: `✅ Empréstimo de \`${loan.valor.toLocaleString()}\` aprovado para ${loan.userTag}!`,
 components: []
 });

 // Log
 const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
 if (canalLogs) {
 await canalLogs.send({
 embeds: [
 new EmbedBuilder()
 .setTitle('📝 LOG: EMPRÉSTIMO APROVADO')
 .setDescription(
 `**Jogador:** <@${loan.userId}>\n` +
 `**Valor:** \`${loan.valor.toLocaleString()}\`\n` +
 `**Aprovado por:** <@${interaction.user.id}>`
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

 loan.status = 'recusado';
 loan.recusadoPor = interaction.user.id;

 // 🎨 DM MODERNA - Empréstimo Recusado
 try {
 const user = await interaction.client.users.fetch(loan.userId);

 const embed = new EmbedBuilder()
 .setTitle('❌ EMPRÉSTIMO RECUSADO')
 .setDescription(
 `⚠️ **Sua solicitação de empréstimo foi recusada.**\n\n` +
 `> **Valor Solicitado:** \`${loan.valor.toLocaleString()}\`\n` +
 `> **Recusado por:** \`${interaction.user.tag}\`\n\n` +
 `💡 *Entre em contato com a administração para mais informações.*`
 )
 .setColor(0xE74C3C)
 .setThumbnail('https://i.imgur.com/8QBYRrm.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/5K9Q5ZK.png' 
 })
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

 // ========== Transferência ==========
 static createTransferModal() {
 const modal = new ModalBuilder()
 .setCustomId('modal_transferir_saldo')
 .setTitle('🔄 Transferir Saldo');

 const usuarioInput = new TextInputBuilder()
 .setCustomId('id_usuario')
 .setLabel('ID do usuário destino')
 .setPlaceholder('Ex: 123456789012345678')
 .setStyle(TextInputStyle.Short)
 .setRequired(true)
 .setMaxLength(20);

 const valorInput = new TextInputBuilder()
 .setCustomId('valor_transferencia')
 .setLabel('Valor a transferir')
 .setPlaceholder('Ex: 50000')
 .setStyle(TextInputStyle.Short)
 .setRequired(true)
 .setMaxLength(12);

 modal.addComponents(
 new ActionRowBuilder().addComponents(usuarioInput),
 new ActionRowBuilder().addComponents(valorInput)
 );
 return modal;
 }

 static async processTransferRequest(interaction) {
 try {
 const userIdDestino = interaction.fields.getTextInputValue('id_usuario').trim();
 const valor = parseInt(interaction.fields.getTextInputValue('valor_transferencia'));

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

 if (userIdDestino === interaction.user.id) {
 return interaction.reply({
 content: '❌ Você não pode transferir para si mesmo!',
 ephemeral: true
 });
 }

 const userOrigem = Database.getUser(interaction.user.id);
 if (userOrigem.saldo < valor) {
 return interaction.reply({
 content: `❌ Saldo insuficiente! Você tem \`${userOrigem.saldo.toLocaleString()}\`.`,
 ephemeral: true
 });
 }

 const transferId = `transf_${Date.now()}_${interaction.user.id}`;
 const transferData = {
 id: transferId,
 fromId: interaction.user.id,
 fromTag: interaction.user.tag,
 toId: userIdDestino,
 valor: valor,
 status: 'pendente',
 timestamp: Date.now()
 };

 if (!global.pendingTransfers) global.pendingTransfers = new Map();
 global.pendingTransfers.set(transferId, transferData);

 console.log(`[Finance] Transfer request ${transferId} from ${interaction.user.id} to ${userIdDestino}`);

 // Buscar usuário destino
 let destinoTag = 'Usuário não encontrado';
 try {
 const destinoUser = await interaction.client.users.fetch(userIdDestino);
 destinoTag = destinoUser.tag;
 transferData.toTag = destinoTag;
 } catch (e) {
 console.log(`[Finance] Could not fetch destination user ${userIdDestino}`);
 }

 // 🎨 DM MODERNA - Solicitação de Transferência (para destino)
 try {
 const destinoUser = await interaction.client.users.fetch(userIdDestino);

 const embed = new EmbedBuilder()
 .setTitle('🔄 SOLICITAÇÃO DE TRANSFERÊNCIA')
 .setDescription(
 `💸 **Você recebeu uma proposta de transferência!**\n\n` +
 `> **De:** \`${interaction.user.tag}\`\n` +
 `> **Valor:** \`${valor.toLocaleString()}\`\n\n` +
 `🤔 *Aceitar ou recusar esta transferência?*`
 )
 .setColor(0xF1C40F)
 .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/8QBYRrm.png' 
 })
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
 content: `✅ Solicitação de transferência enviada para ${destinoTag}! Aguarde confirmação.`,
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

 // Realizar transferência
 Database.removeSaldo(transfer.fromId, transfer.valor, 'transferencia_enviada');
 Database.addSaldo(transfer.toId, transfer.valor, 'transferencia_recebida');

 transfer.status = 'concluida';
 transfer.dataAceite = Date.now();

 // 🎨 DM MODERNA - Transferência Aceita (para origem)
 try {
 const origemUser = await interaction.client.users.fetch(transfer.fromId);

 const embed = new EmbedBuilder()
 .setTitle('✅ TRANSFERÊNCIA CONCLUÍDA')
 .setDescription(
 `🎉 **Sua transferência foi aceita!**\n\n` +
 `> **Para:** \`${interaction.user.tag}\`\n` +
 `> **Valor:** \`${transfer.valor.toLocaleString()}\`\n` +
 `> **Data:** ${new Date().toLocaleString('pt-BR')}\n\n` +
 `💰 O valor já foi debitado da sua conta.`
 )
 .setColor(0x2ECC71)
 .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/8QBYRrm.png' 
 })
 .setTimestamp();

 await origemUser.send({ embeds: [embed] });
 } catch (e) {
 console.log(`[Finance] Could not notify origin user ${transfer.fromId}`);
 }

 // 🎨 DM para quem aceitou
 const embedAceite = new EmbedBuilder()
 .setTitle('✅ TRANSFERÊNCIA RECEBIDA')
 .setDescription(
 `💰 **Você aceitou a transferência!**\n\n` +
 `> **De:** \`${transfer.fromTag}\`\n` +
 `> **Valor Recebido:** \`${transfer.valor.toLocaleString()}\`\n` +
 `> **Data:** ${new Date().toLocaleString('pt-BR')}`
 )
 .setColor(0x2ECC71)
 .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/8QBYRrm.png' 
 })
 .setTimestamp();

 await interaction.update({
 content: '',
 embeds: [embedAceite],
 components: []
 });

 // Log
 const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
 if (canalLogs) {
 await canalLogs.send({
 embeds: [
 new EmbedBuilder()
 .setTitle('📝 LOG: TRANSFERÊNCIA')
 .setDescription(
 `**De:** <@${transfer.fromId}>\n` +
 `**Para:** <@${transfer.toId}>\n` +
 `**Valor:** \`${transfer.valor.toLocaleString()}\``
 )
 .setColor(0x95A5A6)
 .setTimestamp()
 ]
 });
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

 // 🎨 DM MODERNA - Transferência Recusada (para origem)
 try {
 const origemUser = await interaction.client.users.fetch(transfer.fromId);

 const embed = new EmbedBuilder()
 .setTitle('❌ TRANSFERÊNCIA RECUSADA')
 .setDescription(
 `⚠️ **Sua transferência foi recusada.**\n\n` +
 `> **Para:** \`${interaction.user.tag}\`\n` +
 `> **Valor:** \`${transfer.valor.toLocaleString()}\`\n\n` +
 `💡 O valor não foi debitado da sua conta.`
 )
 .setColor(0xE74C3C)
 .setThumbnail('https://i.imgur.com/8QBYRrm.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/5K9Q5ZK.png' 
 })
 .setTimestamp();

 await origemUser.send({ embeds: [embed] });
 } catch (e) {
 console.log(`[Finance] Could not notify origin user ${transfer.fromId}`);
 }

 // 🎨 DM para quem recusou
 const embedRecusa = new EmbedBuilder()
 .setTitle('❌ TRANSFERÊNCIA RECUSADA')
 .setDescription(
 `🚫 **Você recusou a transferência.**\n\n` +
 `> **De:** \`${transfer.fromTag}\`\n` +
 `> **Valor:** \`${transfer.valor.toLocaleString()}\``
 )
 .setColor(0xE74C3C)
 .setThumbnail('https://i.imgur.com/8QBYRrm.png')
 .setFooter({ 
 text: 'NOTAG Bot • Sistema Financeiro', 
 iconURL: 'https://i.imgur.com/5K9Q5ZK.png' 
 })
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

 // ========== Consultar Saldo ==========
 static async sendBalanceInfo(user) {
 try {
 const userData = Database.getUser(user.id);
 const emprestimosPendentes = userData.emprestimosPendentes || 0;
 const saldoLiquido = userData.saldo - emprestimosPendentes;

 // 🎨 DM SUPER MODERNA - Consulta de Saldo
 const embed = new EmbedBuilder()
 .setTitle('💰 SEU SALDO')
 .setDescription(
 `📊 **Resumo Financeiro Completo**\n\n` +
 `💵 **Saldo Bruto:** \`\`\`${userData.saldo.toLocaleString()}\`\`\`\n` +
 `📉 **Empréstimos Pendentes:** \`\`\`${emprestimosPendentes.toLocaleString()}\`\`\`\n` +
 `✨ **Saldo Líquido:** \`\`\`${saldoLiquido.toLocaleString()}\`\`\`\n\n` +
 `📈 **Estatísticas:**\n` +
 `> Total Recebido: \`${userData.totalRecebido.toLocaleString()}\`\n` +
 `> Total Sacado: \`${userData.totalSacado.toLocaleString()}\`\n` +
 `> Total em Empréstimos: \`${userData.totalEmprestimos || 0}\``
 )
 .setColor(0x2ECC71)
 .setThumbnail('https://i.imgur.com/5K9Q5ZK.png')
 .setImage('https://i.imgur.com/JPepvGx.png') // Banner opcional
 .setFooter({ 
 text: `NOTAG Bot • Sistema Financeiro • ${new Date().toLocaleDateString('pt-BR')}`, 
 iconURL: 'https://i.imgur.com/8QBYRrm.png' 
 })
 .setTimestamp();

 // Adicionar barra de progresso visual (opcional)
 const percentualSaque = userData.totalRecebido > 0 
 ? Math.round((userData.totalSacado / userData.totalRecebido) * 100) 
 : 0;

 embed.addFields({
 name: '📊 Movimentação',
 value: `Saque/Recebimento: \`${percentualSaque}%\``,
 inline: false
 });

 await user.send({ embeds: [embed] });
 console.log(`[Finance] Balance info sent to ${user.id}`);
 } catch (error) {
 console.error(`[Finance] Error sending balance info:`, error);
 throw error;
 }
 }
}

module.exports = FinanceHandler;