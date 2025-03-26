const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const natural = require('natural');
const { WordTokenizer } = natural;

// Классификатор сущностей
class EntityClassifier {
    constructor() {
        this.organizations = new Set();
        this.personalities = new Set();
        this.tokenizer = new WordTokenizer();
        
        // Загружаем словари (можно расширить)
        this.personTitles = ['г-н', 'г-жа', 'д-р', 'проф', 'мистер', 'миссис'];
        this.orgKeywords = ['инк', 'корп', 'ооо', 'зао', 'пао', 'лтд', 'компания', 'фирма', 'ассоциация'];
    }

    // Анализ текста и извлечение сущностей
    analyze(text) {
        const sentences = text.split(/[.!?]+/);
        
        sentences.forEach(sentence => {
            const tokens = this.tokenizer.tokenize(sentence);
            
            // Проверяем каждое слово с заглавной буквы как потенциальную сущность
            for (let i = 0; i < tokens.length; i++) {
                const token = tokens[i];
                
                if (this.isCapitalized(token)) {
                    // Проверка на персоналии
                    if (this.isPerson(tokens, i)) {
                        const fullName = this.extractFullName(tokens, i);
                        if (fullName) {
                            this.personalities.add(fullName);
                            i += fullName.split(' ').length - 1;
                        }
                    }
                    // Проверка на организации
                    else if (this.isOrganization(tokens, i)) {
                        const orgName = this.extractOrganizationName(tokens, i);
                        if (orgName) {
                            this.organizations.add(orgName);
                            i += orgName.split(' ').length - 1;
                        }
                    }
                }
            }
        });
    }
    
    // Проверка, что слово начинается с заглавной буквы
    isCapitalized(word) {
        return word.length > 0 && word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase();
    }
    
    // Проверка, является ли токен персоналией
    isPerson(tokens, index) {
        // Если перед именем есть титул
        if (index > 0 && this.personTitles.includes(tokens[index-1].toLowerCase())) {
            return true;
        }
        
        // Если это имя + фамилия
        if (index < tokens.length - 1 && this.isCapitalized(tokens[index+1])) {
            return true;
        }
        
        // Если это фамилия с инициалами
        if (tokens[index].includes('.') && index > 0 && tokens[index-1].includes('.')) {
            return true;
        }
        
        return false;
    }
    
    // Извлечение полного имени
    extractFullName(tokens, index) {
        let nameParts = [tokens[index]];
        
        // Проверяем следующие токены на продолжение имени
        for (let i = index + 1; i < tokens.length; i++) {
            if (this.isCapitalized(tokens[i]) || tokens[i].includes('.')) {
                nameParts.push(tokens[i]);
            } else {
                break;
            }
        }
        
        return nameParts.length > 1 ? nameParts.join(' ') : null;
    }
    
    // Проверка, является ли токен организацией
    isOrganization(tokens, index) {
        // Проверяем ключевые слова в названии
        const lowerToken = tokens[index].toLowerCase();
        if (this.orgKeywords.some(keyword => lowerToken.includes(keyword))) {
            return true;
        }
        
        // Проверяем следующие токены на ключевые слова
        for (let i = index + 1; i < Math.min(index + 3, tokens.length); i++) {
            const lowerNext = tokens[i].toLowerCase();
            if (this.orgKeywords.some(keyword => lowerNext.includes(keyword))) {
                return true;
            }
        }
        
        return false;
    }
    
    // Извлечение названия организации
    extractOrganizationName(tokens, index) {
        let orgParts = [tokens[index]];
        
        // Проверяем следующие токены на продолжение названия
        for (let i = index + 1; i < Math.min(index + 5, tokens.length); i++) {
            if (this.isCapitalized(tokens[i]) || 
                this.orgKeywords.some(keyword => tokens[i].toLowerCase().includes(keyword))) {
                orgParts.push(tokens[i]);
            } else {
                break;
            }
        }
        
        return orgParts.length > 0 ? orgParts.join(' ') : null;
    }
    
    // Получение результатов
    getResults() {
        return {
            organizations: Array.from(this.organizations),
            personalities: Array.from(this.personalities)
        };
    }
}

// Обработчик файлов
class FileProcessor {
    static async processFile(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        
        try {
            if (ext === '.txt') {
                return fs.promises.readFile(filePath, 'utf-8');
            } else if (ext === '.docx') {
                const result = await mammoth.extractRawText({ path: filePath });
                return result.value;
            } else {
                throw new Error('Unsupported file format');
            }
        } catch (err) {
            console.error(`Error processing file ${filePath}:`, err);
            return null;
        }
    }
}

// Основная функция
async function main() {
    if (process.argv.length < 3) {
        console.log('Usage: node text-analyzer.js <input-file> [output-file]');
        process.exit(1);
    }
    
    const inputFile = process.argv[2];
    const outputFile = process.argv[3] || null;
    
    console.log(`Processing file: ${inputFile}`);
    
    // Чтение и обработка файла
    const text = await FileProcessor.processFile(inputFile);
    if (!text) {
        console.error('Failed to process the file');
        process.exit(1);
    }
    
    // Анализ текста
    const classifier = new EntityClassifier();
    classifier.analyze(text);
    const results = classifier.getResults();
    
    // Формирование таблицы результатов
    const table = [];
    const maxRows = Math.max(results.organizations.length, results.personalities.length);
    
    for (let i = 0; i < maxRows; i++) {
        table.push({
            '№': i + 1,
            'Организация': results.organizations[i] || '',
            'Персоналия': results.personalities[i] || ''
        });
    }
    
    // Вывод результатов
    if (outputFile) {
        let outputText = 'Результаты анализа текста:\n\n';
        outputText += '№\tОрганизация\t\tПерсоналия\n';
        outputText += '--------------------------------------------\n';
        
        table.forEach(row => {
            outputText += `${row['№']}\t${row['Организация']}\t\t${row['Персоналия']}\n`;
        });
        
        fs.writeFileSync(outputFile, outputText, 'utf-8');
        console.log(`Results saved to ${outputFile}`);
    } else {
        console.log('Результаты анализа текста:');
        console.table(table);
    }
}

main().catch(console.error);
