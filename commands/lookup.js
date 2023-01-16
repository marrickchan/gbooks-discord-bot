/*
  https://discord.js.org/#/docs/builders/main/class/SlashCommandBuilder?scrollTo=addStringOption
  https://developers.google.com/books/docs/v1/reference/volumes/list
*/

const { SlashCommandBuilder } = require('discord.js');
const { apiKey } = require('../auth.json');
const https = require('https');

module.exports = {
	data: new SlashCommandBuilder()
		.setName('lookup')
		.setDescription('Find book')
    .addStringOption(option =>
      option.setName('search-term')
        .setDescription('Search term (can be book or author')
        .setRequired(true)),
	async execute(interaction) {
    const response = 'Getting results...';
    const searchTerm = interaction.options.getString('search-term');
    console.log('searchTerm: ' + searchTerm);
	}
};