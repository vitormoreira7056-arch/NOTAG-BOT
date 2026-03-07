const Database = require('./database');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas'); // Requer instalação: npm install chartjs-node-canvas chart.js

/**
 * Sistema de Analytics e Relatórios
 * Gera gráficos e estatísticas da guilda
 */

class Analytics {
  constructor() {
    this.chartCanvas = new ChartJSNodeCanvas({ width: 800, height: 400 });
  }

  /**
   * Gera relatório de atividade financeira
   */
  async generateFinancialReport(guildId, days = 30) {
    const since = Date.now() - (days * 24 * 60 * 60 * 1000);

    // Busca transações
    const stmt = Database.db.prepare(`
      SELECT DATE(created_at/1000, 'unixepoch') as date,
             type,
             SUM(amount) as total,
             COUNT(*) as count
      FROM transactions
      WHERE guild_id = ? AND created_at > ?
      GROUP BY DATE(created_at/1000, 'unixepoch'), type
      ORDER BY date
    `);

    const data = stmt.all(guildId, since);

    // Processa dados para gráfico
    const dates = [...new Set(data.map(d => d.date))];
    const datasets = {};

    data.forEach(row => {
      if (!datasets[row.type]) {
        datasets[row.type] = new Array(dates.length).fill(0);
      }
      const idx = dates.indexOf(row.date);
      datasets[row.type][idx] = row.total;
    });

    // Gera gráfico
    const chartConfig = {
      type: 'line',
      data: {
        labels: dates,
        datasets: Object.entries(datasets).map(([type, values]) => ({
          label: type,
          data: values,
          borderColor: this.getColorForType(type),
          tension: 0.1
        }))
      },
      options: {
        responsive: true,
        plugins: {
          title: { display: true, text: `Atividade Financeira - Últimos ${days} dias` }
        }
      }
    };

    const image = await this.chartCanvas.renderToBuffer(chartConfig);
    return { image, data: this.summarizeData(data) };
  }

  /**
   * Estatísticas de participação em eventos
   */
  async generateParticipationStats(guildId) {
    const stmt = Database.db.prepare(`
      SELECT 
        COUNT(*) as total_events,
        AVG(CASE WHEN status = 'encerrado' THEN 1 ELSE 0 END) as completion_rate,
        SUM(valor_total) as total_loot
      FROM events
      WHERE guild_id = ?
    `);

    const stats = stmt.get(guildId);

    // Top participantes
    const topStmt = Database.db.prepare(`
      SELECT user_id, COUNT(*) as events_count
      FROM (
        SELECT json_each.value as user_id
        FROM events, json_each(events.participantes)
        WHERE guild_id = ?
      )
      GROUP BY user_id
      ORDER BY events_count DESC
      LIMIT 10
    `);

    const topUsers = topStmt.all(guildId);

    return {
      ...stats,
      topParticipants: topUsers
    };
  }

  getColorForType(type) {
    const colors = {
      'credito': 'rgb(46, 204, 113)',
      'debito': 'rgb(231, 76, 60)',
      'emprestimo': 'rgb(52, 152, 219)',
      'taxa_guilda': 'rgb(26, 188, 156)'
    };
    return colors[type] || 'rgb(149, 165, 166)';
  }

  summarizeData(data) {
    const summary = {};
    data.forEach(row => {
      if (!summary[row.type]) summary[row.type] = 0;
      summary[row.type] += row.total;
    });
    return summary;
  }

  /**
   * Heatmap de atividade por horário
   */
  generateActivityHeatmap(transactions) {
    // Agrupa por hora do dia
    const hours = new Array(24).fill(0);
    transactions.forEach(t => {
      const hour = new Date(t.created_at).getHours();
      hours[hour]++;
    });

    return hours;
  }
}

module.exports = new Analytics();