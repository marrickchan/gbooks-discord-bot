const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, Events, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const { request } = require('undici');
const { token, apiKey } = require('./auth.json');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, () => {
	console.log('Ready!');
});

client.on(Events.InteractionCreate, async interaction => {
    function limit(textSnippet) {
        return textSnippet.substring(0,1024);
    }

	if (!interaction.isChatInputCommand()) return;

	const command = client.commands.get(interaction.commandName);

	const { commandName } = interaction;
	await interaction.deferReply();

    if (commandName === 'lookup') {
        // Get the results of the lookup
        const searchTerm = interaction.options.getString('search-term');
		const { statusCode, body} = await request("https://www.googleapis.com/books/v1/volumes?q=" + searchTerm + "&key=" + apiKey);
        console.log(statusCode);

        if (statusCode !== 200) {
            interaction.editReply('Could not reach server');
        } else {
            // Get Body to Parse
            const searchResults = await body.json();

            // Only get first result for now. Could loop and add scrolling
            // TEMPORARY RESULT LOGGING
            const singleResult = searchResults.items[0].volumeInfo;
            // console.log('results', singleResult);

            // Build Custom Object for Display
            const resObj = {};
            resObj.title = singleResult.title;
            resObj.author = singleResult.authors.join(',');
            resObj.link = singleResult.infoLink;
            resObj.avgRating = singleResult.averageRating;
            resObj.countRatings = singleResult.ratingsCount;
            resObj.description = singleResult.description;
            resObj.publishedDate = singleResult.publishedDate;
            resObj.thumbnailUrl = singleResult.imageLinks.thumbnail;
            resObj.pageCount = singleResult.pageCount;
            
            try {
                const embed = new EmbedBuilder()
                .setColor(0xEFFF00)
                .setTitle(resObj.title)
                .setURL(resObj.link)
                .setImage(resObj.thumbnailUrl)
                .addFields({
                    name: 'Date Published',
                    value: limit(resObj.publishedDate) || ''
                },
                {
                    name: 'Author',
                    value: limit(resObj.author) || ''
                },
                {
                    name: 'Rating',
                    value: resObj.avgRating + ' (' + resObj.countRatings + ' ratings)' || ''
                },
                {
                    name: 'Page Count',
                    value: resObj.pageCount + '' || ''
                },
                {
                    name: 'Description',
                    value: limit(resObj.description) || ''
                }) 

                interaction.editReply({ embeds: [embed] });
            } catch (e) {
                console.log(e.message);
            }
            

        }
        
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
	}
});

client.login(token);