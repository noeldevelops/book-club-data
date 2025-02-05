import { google } from 'googleapis';
import { readFileSync } from 'fs';
import axios from 'axios';

const CREDENTIALS_PATH = './rubber-ducks-book-club-d1ff42f7cbd8.json';
const SHEET_ID = '1C2TuZrF9KFcqwZFIEHbCFDLL1k_T6DkwOGk7yw6gRN4'; // 2025 Recs
const RANGE_READ = 'recs!B2:C'; // Read columns B and C (title and author)
const RANGE_WRITE = 'recs!D2:J'; // Adjust for where to write the Google Books data

// Authenticate with Google Sheets API
async function authenticate() {
    const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH));
    const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    return auth;
}

// Fetch book details from Google Books API
async function getBookInfo(title, author) {
    if (!title) {
        return { link: 'None', author: '', description: '' };
    }
    // Include author in search query if available
    const searchQuery = author ? `${title} inauthor:${author}` : title;
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(searchQuery)}`;
    
    try {
        const response = await axios.get(url);
        const books = response.data.items || [];
        
        // Try to find the best matching book from results
        let bestMatch = books[0]; // Default to first result
        for (const book of books) {
            const searchTitle = title?.toLowerCase();
            const resultTitle = book.volumeInfo.title?.toLowerCase();
            // If we find an exact title match, use that book
            if (searchTitle === resultTitle) {
                // If author matches too, this is definitely the best match
                if (author && book.volumeInfo.authors) {
                    const bookAuthors = book.volumeInfo.authors?.join(', ')?.toLowerCase();
                    if (bookAuthors.includes(author?.toLowerCase())) {
                        bestMatch = book;
                        break;
                    }
                } else {
                    bestMatch = book;
                    break;
                }
            }
        }

        if (!bestMatch) {
            return { link: 'Not found', author: 'Not found', description: 'Not found' };
        }
        return {
            link: bestMatch.volumeInfo.infoLink || 'Not available',
            author: bestMatch.volumeInfo.authors?.join(', ') || 'Unknown author',
            description: bestMatch.volumeInfo.description || 'No description available',
            publishedDate: bestMatch.volumeInfo.publishedDate || 'Unknown date',
            categories: bestMatch.volumeInfo.categories || [],
            title: bestMatch.volumeInfo.title || 'Unknown title',
            subtitle: bestMatch.volumeInfo.subtitle || ''
        };
    } catch (error) {
        console.error(`Error fetching data for "${title}":`, error.message);
        return { link: 'Error', author: 'Error', description: 'Error' };
    }
}

// Main function to read, process, and write data
async function processSheet() {
    const auth = await authenticate();
    const sheets = google.sheets({ version: 'v4', auth });

    try {
        // Read book titles and authors from the sheet
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SHEET_ID,
            range: RANGE_READ,
        });
        const rows = response.data.values || [];
        console.log(`Found ${rows.length} books.`);

        // Get book info for each title+author pair
        const bookData = [];
        for (const row of rows) {
            const title = row[0];
            const author = row[1] || ''; // Get author if available
            console.log(`Fetching data for: ${title} by ${author}`);
            const info = await getBookInfo(title, author);
            bookData.push([
                info.link,
                info.author,
                info.description,
                info.publishedDate,
                info.categories?.join(', '),
                info.title,
                info.subtitle
            ]);
        }

        // Write data back to the sheet
        await sheets.spreadsheets.values.update({
            spreadsheetId: SHEET_ID,
            range: RANGE_WRITE,
            valueInputOption: 'RAW',
            resource: { values: bookData },
        });

        console.log('Google Books data written to sheet successfully.');
    } catch (error) {
        console.error('Error processing the sheet:', error.message);
    }
}

// Run the script
processSheet();
