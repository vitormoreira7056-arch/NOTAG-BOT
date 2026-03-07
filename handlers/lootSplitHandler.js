const {
 EmbedBuilder,
 ActionRowBuilder,
 ButtonBuilder,
 ButtonStyle,
 ModalBuilder,
 TextInputBuilder,
 TextInputStyle,
 ChannelType,
 PermissionFlagsBits
} = require('discord.js');
const Database = require('../utils/database');

class LootSplitHandler {
 constructor() {
 this.simulations = new Map();
 this.pendingApprovals = new Map();
 }

 static createSimulationModal(eventId) {
 const modal = new ModalBuilder()
 .setCustomId(`modal_simular_evento_${eventId}`)
 .setTitle('💰 Simular Divisão de Loot');

 const valorTotalInput = new TextInputBuilder()
 .setCustomId('valor_total')
 .setLabel('💎 Valor Total do Evento')
 .setPlaceholder('Ex: 1000000')
 .setStyle(TextInputStyle.Short)
 .setRequired(true)
 .setMaxLength(12);

 const valorSacosInput = new TextInputBuilder()
 .setCustomId('valor_sacos')
 .setLabel('🎒 Valor dos Sacos (adicional)')
 .setPlaceholder('Valor extra dos sacos (será adicionado ao total)')
 .setStyle(TextInputStyle.Short)
 .setRequired(false)
 .setMaxLength(12);

 const valorReparoInput = new TextInputBuilder()
 .setCustomId('valor_reparo')
 .setLabel('🔧 Valor do Reparo (descontar)')
 .setPlaceholder('Ex: 50000')
 .setStyle(TextInputStyle.Short)
 .setRequired(false)
 .setMaxLength(12);

 modal.addComponents(
 new ActionRowBuilder().addComponents(valorTotalInput),
 new ActionRowBuilder().addComponents(valorSacosInput),
 new ActionRowBuilder().addComponents(valorReparoInput)
 );

 return modal;
 }

 static async processSimulation(interaction, eventId) {
 try {
 console.log(`[LootSplit] Processing simulation for event: ${eventId}`);

 const valorTotal = parseInt(interaction.fields.getTextInputValue('valor_total'));
 const valorSacosInput = interaction.fields.getTextInputValue('valor_sacos');
 const valorReparoInput = interaction.fields.getTextInputValue('valor_reparo');

 if (isNaN(valorTotal) || valorTotal <= 0) {
 return interaction.reply({
 content: '❌ Valor total inválido!',
 ephemeral: true
 });
 }

 const valorSacos = valorSacosInput ? parseInt(valorSacosInput) : 0;
 const valorReparo = valorReparoInput ? parseInt(valorReparoInput) : 0;

 if ((valorSacosInput && isNaN(valorSacos)) || (valorReparoInput && isNaN(valorReparo))) {
 return interaction.reply({
 content: '❌ Valores de sacos ou reparo inválidos!',
 ephemeral: true
 });
 }

 let eventData = global.activeEvents.get(eventId);
 if (!eventData) {
 eventData = global.finishedEvents?.get(eventId);
 }

 if (!eventData) {
 return interaction.reply({
 content: '❌ Evento não encontrado!',
 ephemeral: true
 });
 }

 const config = global.guildConfig?.get(interaction.guild.id) || {};
 const taxaGuilda = config.taxaGuilda || 10;

 let tempoTotalEvento = 0;
 if (eventData.inicioTimestamp && eventData.finalizadoEm) {
 tempoTotalEvento = eventData.finalizadoEm - eventData.inicioTimestamp;
 } else if (eventData.inicioTimestamp) {
 tempoTotalEvento = Date.now() - eventData.inicioTimestamp;
 }

 let tempoTotalParticipacao = 0;
 const participantes = Array.from(eventData.participantes.entries());

 participantes.forEach(([userId, data]) => {
 let tempo = data.tempoTotal || 0;
 if (!eventData.finalizadoEm && !data.pausado && data.tempoInicio && eventData.status === 'em_andamento') {
 tempo += Date.now() - data.tempoInicio;
 }
 tempoTotalParticipacao += tempo;
 });

 if (tempoTotalParticipacao === 0) {
 tempoTotalParticipacao = tempoTotalEvento * participantes.length;
 }

 // 🎯 CORREÇÃO: Sacos são ADICIONADOS ao valor total, não subtraídos
 // Fórmula correta: (Valor Total + Sacos - Reparo) = Valor Líquido para divisão
 const valorBase = valorTotal + valorSacos - valorReparo;
 const valorTaxa = Math.floor(valorBase * (taxaGuilda / 100));
 const valorDistribuir = valorBase - valorTaxa;

 const distribuicao = participantes.map(([userId, data]) => {
 let tempoParticipacao = data.tempoTotal || 0;
 if (!eventData.finalizadoEm && !data.pausado && data.tempoInicio && eventData.status === 'em_andamento') {
 tempoParticipacao += Date.now() - data.tempoInicio;
 }

 const percentagem = tempoTotalParticipacao > 0 ?
 (tempoParticipacao / tempoTotalParticipacao) :
 (1 / participantes.length);

 const valorReceber = Math.floor(valorDistribuir * percentagem);

 return {
 userId,
 nick: data.nick,
 tempo: tempoParticipacao,
 percentagem: (percentagem * 100).toFixed(2),
 valor: valorReceber
 };
 });

 const simulationId = `sim_${Date.now()}_${eventId}`;
 const simulationData = {
 id: simulationId,
 eventId: eventId,
 guildId: interaction.guild.id,
 canalEventoId: interaction.channel.id,
 criadorId: interaction.user.id,
 valorTotal,
 valorSacos,
 valorReparo,
 valorTaxa,
 taxaGuilda,
 valorDistribuir,
 distribuicao,
 status: 'simulado',
 timestamp: Date.now()
 };

 if (!global.simulations) global.simulations = new Map();
 global.simulations.set(simulationId, simulationData);

 console.log(`[LootSplit] Simulation ${simulationId} created. Base: ${valorBase} (Total: ${valorTotal} + Sacos: ${valorSacos} - Reparo: ${valorReparo})`);

 const embed = this.createSimulationEmbed(simulationData, eventData);

 const botoes = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId(`loot_enviar_${simulationId}`)
 .setLabel('📤 Enviar para Financeiro')
 .setStyle(ButtonStyle.Success),
 new ButtonBuilder()
 .setCustomId(`loot_recalcular_${simulationId}`)
 .setLabel('🔄 Recalcular')
 .setStyle(ButtonStyle.Primary),
 new ButtonBuilder()
 .setCustomId(`loot_atualizar_part_${simulationId}`)
 .setLabel('⚙️ Atualizar Participação')
 .setStyle(ButtonStyle.Secondary)
 );

 await interaction.reply({
 embeds: [embed],
 components: [botoes],
 ephemeral: false
 });

 } catch (error) {
 console.error(`[LootSplit] Error processing simulation:`, error);
 await interaction.reply({
 content: '❌ Erro ao processar simulação. Verifique os valores informados.',
 ephemeral: true
 });
 }
 }

 static createSimulationEmbed(simulation, eventData) {
 const embed = new EmbedBuilder()
 .setTitle('💰 SIMULAÇÃO DE DIVISÃO DE LOOT')
 .setDescription(
 `## ${eventData.nome}\n\n` +
 `**💎 Valor Base:** \`${simulation.valorTotal.toLocaleString()}\`\n` +
 `**🎒 Sacos (adicional):** \`${simulation.valorSacos.toLocaleString()}\`\n` +
 `**🔧 Reparo:** \`${simulation.valorReparo.toLocaleString()}\`\n` +
 `**📊 Taxa Guilda (${simulation.taxaGuilda}%):** \`${simulation.valorTaxa.toLocaleString()}\`\n` +
 `**💵 Valor a Distribuir:** \`${simulation.valorDistribuir.toLocaleString()}\``
 )
 .setColor(0xF1C40F)
 .setTimestamp();

 const listaParticipantes = simulation.distribuicao.map(p => {
 const tempoMin = Math.floor(p.tempo / 1000 / 60);
 return `${p.nick}: \`${p.valor.toLocaleString()}\` (${p.percentagem}%) - ${tempoMin}min`;
 }).join('\n');

 embed.addFields({
 name: `👥 Participantes (${simulation.distribuicao.length})`,
 value: listaParticipantes || 'Nenhum participante',
 inline: false
 });

 return embed;
 }

 static async handleEnviar(interaction, simulationId) {
 try {
 console.log(`[LootSplit] Sending simulation ${simulationId} to financeiro`);

 const simulation = global.simulations?.get(simulationId);
 if (!simulation) {
 return interaction.reply({
 content: '❌ Simulação não encontrada!',
 ephemeral: true
 });
 }

 const eventData = global.activeEvents.get(simulation.eventId) || global.finishedEvents?.get(simulation.eventId);
 const canalFinanceiro = interaction.guild.channels.cache.find(c => c.name === '📊╠financeiro');

 if (!canalFinanceiro) {
 return interaction.reply({
 content: '❌ Canal financeiro não encontrado!',
 ephemeral: true
 });
 }

 const embedAprovacao = new EmbedBuilder()
 .setTitle('🔔 PAGAMENTO PENDENTE DE APROVAÇÃO')
 .setDescription(
 `**Evento:** ${eventData?.nome || 'Desconhecido'}\n` +
 `**Criador:** <@${simulation.criadorId}>\n` +
 `**Valor Total:** \`${simulation.valorTotal.toLocaleString()}\`\n` +
 `**Sacos:** \`${simulation.valorSacos.toLocaleString()}\`\n` +
 `**Taxa Guilda:** \`${simulation.valorTaxa.toLocaleString()}\`\n` +
 `**A Distribuir:** \`${simulation.valorDistribuir.toLocaleString()}\``
 )
 .setColor(0xE74C3C)
 .setTimestamp();

 const botoesAprovacao = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId(`fin_aprovar_${simulationId}`)
 .setLabel('✅ Confirmar e Depositar')
 .setStyle(ButtonStyle.Success),
 new ButtonBuilder()
 .setCustomId(`fin_recusar_${simulationId}`)
 .setLabel('❌ Recusar Depósito')
 .setStyle(ButtonStyle.Danger)
 );

 const admRole = interaction.guild.roles.cache.find(r => r.name === 'ADM');
 const staffRole = interaction.guild.roles.cache.find(r => r.name === 'Staff');

 await canalFinanceiro.send({
 content: `🔔 <@&${admRole?.id}> <@&${staffRole?.id}> Nova solicitação de pagamento!`,
 embeds: [embedAprovacao],
 components: [botoesAprovacao]
 });

 await interaction.update({
 content: '✅ Solicitação enviada para o canal financeiro!',
 components: []
 });

 } catch (error) {
 console.error(`[LootSplit] Error sending to financeiro:`, error);
 await interaction.reply({
 content: '❌ Erro ao enviar para financeiro.',
 ephemeral: true
 });
 }
 }

 static async handleRecalcular(interaction, simulationId) {
 try {
 console.log(`[LootSplit] Recalculating simulation ${simulationId}`);

 const simulation = global.simulations?.get(simulationId);
 if (!simulation) {
 return interaction.reply({
 content: '❌ Simulação não encontrada!',
 ephemeral: true
 });
 }

 const modal = this.createSimulationModal(simulation.eventId);
 await interaction.showModal(modal);

 } catch (error) {
 console.error(`[LootSplit] Error recalculating:`, error);
 await interaction.reply({
 content: '❌ Erro ao recalcular.',
 ephemeral: true
 });
 }
 }

 static async handleAprovacaoFinanceira(interaction, simulationId, aprovar) {
 try {
 console.log(`[LootSplit] Processing financial approval for ${simulationId}: ${aprovar}`);

 const simulation = global.simulations?.get(simulationId);
 if (!simulation) {
 return interaction.reply({
 content: '❌ Simulação não encontrada!',
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

 if (!aprovar) {
 await interaction.update({
 content: `❌ Pagamento recusado por ${interaction.user.tag}`,
 components: []
 });

 const canalEvento = interaction.guild.channels.cache.get(simulation.canalEventoId);
 if (canalEvento) {
 await canalEvento.send({
 embeds: [
 new EmbedBuilder()
 .setTitle('❌ PAGAMENTO RECUSADO')
 .setDescription(`O pagamento foi recusado por <@${interaction.user.id}>`)
 .setColor(0xE74C3C)
 ]
 });
 }
 return;
 }

 await interaction.deferUpdate();

 let sucessos = 0;
 let falhas = 0;

 for (const participante of simulation.distribuicao) {
 try {
 Database.addSaldo(participante.userId, participante.valor, 'loot_split_evento');
 sucessos++;

 try {
 const user = await interaction.client.users.fetch(participante.userId);
 await user.send({
 embeds: [
 new EmbedBuilder()
 .setTitle('💰 PAGAMENTO RECEBIDO')
 .setDescription(
 `Você recebeu \`${participante.valor.toLocaleString()}\` do evento!\n` +
 `Novo saldo: \`${Database.getUser(participante.userId).saldo.toLocaleString()}\``
 )
 .setColor(0x57F287)
 .setTimestamp()
 ]
 });
 } catch (e) {
 console.log(`[LootSplit] Could not DM user ${participante.userId}`);
 }
 } catch (error) {
 console.error(`[LootSplit] Error depositing to ${participante.userId}:`, error);
 falhas++;
 }
 }

 if (simulation.valorTaxa > 0) {
 Database.addTransaction({
 type: 'credito',
 userId: 'GUILD_BANK',
 amount: simulation.valorTaxa,
 reason: 'taxa_guilda',
 guildId: interaction.guild.id,
 eventId: simulation.eventId,
 timestamp: Date.now()
 });
 }

 simulation.status = 'pago';
 simulation.aprovadoPor = interaction.user.id;
 simulation.aprovadoEm = Date.now();

 await interaction.editReply({
 content: `✅ Pagamento aprovado! ${sucessos} participantes receberam o loot. ${falhas > 0 ? `${falhas} falhas.` : ''}`,
 components: []
 });

 const canalEvento = interaction.guild.channels.cache.get(simulation.canalEventoId);
 if (canalEvento) {
 const embedConfirmado = new EmbedBuilder()
 .setTitle('✅ PAGAMENTO CONFIRMADO')
 .setDescription(
 `**Evento pago por:** <@${interaction.user.id}>\n` +
 `**Total distribuído:** \`${simulation.valorDistribuir.toLocaleString()}\`\n` +
 `**Taxa guilda:** \`${simulation.valorTaxa.toLocaleString()}\``
 )
 .setColor(0x2ECC71)
 .setTimestamp();

 const botaoArquivar = new ActionRowBuilder()
 .addComponents(
 new ButtonBuilder()
 .setCustomId(`loot_arquivar_${simulationId}`)
 .setLabel('📁 Arquivar Evento')
 .setStyle(ButtonStyle.Primary)
 );

 await canalEvento.send({
 embeds: [embedConfirmado],
 components: [botaoArquivar]
 });
 }

 const canalLogs = interaction.guild.channels.cache.find(c => c.name === '📜╠logs-banco');
 if (canalLogs) {
 await canalLogs.send({
 embeds: [
 new EmbedBuilder()
 .setTitle('📝 LOG: PAGAMENTO DE EVENTO')
 .setDescription(
 `**Evento:** ${simulation.eventId}\n` +
 `**Aprovado por:** <@${interaction.user.id}>\n` +
 `**Valor Total:** \`${simulation.valorTotal.toLocaleString()}\`\n` +
 `**Sacos:** \`${simulation.valorSacos.toLocaleString()}\`\n` +
 `**Participantes:** ${simulation.distribuicao.length}\n` +
 `**Data:** ${new Date().toLocaleString()}`
 )
 .setColor(0x3498DB)
 .setTimestamp()
 ]
 });
 }

 } catch (error) {
 console.error(`[LootSplit] Error in financial approval:`, error);
 await interaction.followUp({
 content: '❌ Erro ao processar aprovação.',
 ephemeral: true
 });
 }
 }

 static async handleArquivar(interaction, eventId, simulationId) {
 try {
 console.log(`[LootSplit] Archiving event ${eventId} with simulation ${simulationId}`);

 const simulation = global.simulations?.get(simulationId);
 if (!simulation) {
 return interaction.reply({
 content: '❌ Simulação não encontrada!',
 ephemeral: true
 });
 }

 const actualEventId = eventId || simulation.eventId;

 Database.addEventHistory({
 eventId: actualEventId,
 simulationId: simulationId,
 guildId: interaction.guild.id,
 arquivadoPor: interaction.user.id,
 timestamp: Date.now(),
 dados: simulation || {}
 });

 const canalEvento = interaction.guild.channels.cache.get(interaction.channel.id);

 if (canalEvento) {
 await interaction.update({
 content: '📁 **EVENTO ARQUIVADO**',
 components: []
 });

 setTimeout(async () => {
 try {
 await canalEvento.delete('Evento arquivado');
 console.log(`[LootSplit] Deleted archived event channel: ${canalEvento.id}`);
 } catch (e) {
 console.error('[LootSplit] Error deleting channel:', e);
 }
 }, 5000);
 }

 } catch (error) {
 console.error(`[LootSplit] Error archiving event:`, error);
 await interaction.reply({
 content: '❌ Erro ao arquivar evento.',
 ephemeral: true
 });
 }
 }
}

module.exports = LootSplitHandler;