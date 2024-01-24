import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isBetween from 'dayjs/plugin/isBetween';
import yaml from 'yaml';
import fs from 'fs';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isBetween);

interface Available<T> {
    begin: T;
    end: T;
    weight: number;
}

interface Person {
    name: string;
    timezone: string;
    available: Available<string>[];
}

interface Config {
    people: Person[];
}

// 获取当前年份，作为配置文件里年份的占位符
const year = dayjs().year();

// 格式
const format = 'YYYY-MM-DD HH:mm';

// 读取 config.yaml 并进行解析
const config: Config = yaml.parse(fs.readFileSync('./config.yaml', 'utf8'));

// 获取所有人的时间，获取出最早和最晚的时间，从而确定扫描的时间范围
const allTimes = config.people.map(person => {
    return person.available.map(({ begin, end, weight }) => {
        const beginTime = dayjs.tz(`${year}-${begin}`, format, person.timezone);
        const endTime = dayjs.tz(`${year}-${end}`, format, person.timezone);
        return {
            begin: beginTime,
            end: endTime,
            weight
        }
    })
}).flat();

// 获取最早和最晚的时间
const beginTime = allTimes.reduce((prev, curr) => {
    return prev.begin.isBefore(curr.begin) ? prev : curr;
});
const endTime = allTimes.reduce((prev, curr) => {
    return prev.end.isAfter(curr.end) ? prev : curr;
});

// 从最早时间到最晚时间，以1小时为粒度开始扫描，直到最晚时间
// 扫描候选项，寻找所有人都有空的时间段
// 在有空的时间段内，记录下当前时间段每个人的权重，并相加
// 最后按照权重排序，输出结果
const result: Available<dayjs.Dayjs>[] = [];
let currentTime = beginTime.begin;
while (currentTime.isBefore(endTime.end)) {
    // 判断当前时间是否在所有人的可用时间范围内
    const isAllAvailable = config.people.every(person => {
        return person.available.some(({ begin, end }) => {
            const beginTime = dayjs.tz(`${year}-${begin}`, format, person.timezone);
            const endTime = dayjs.tz(`${year}-${end}`, format, person.timezone);
            return currentTime.isBetween(beginTime, endTime);
        });
    });
    if (isAllAvailable) {
        // 如果是，则计算当前时间的权重
        let totalWeight = 0;
        config.people.forEach(person => {
            person.available.forEach(({ begin, end, weight }) => {
                const beginTime = dayjs.tz(`${year}-${begin}`, format, person.timezone);
                const endTime = dayjs.tz(`${year}-${end}`, format, person.timezone);
                if (currentTime.isBetween(beginTime, endTime)) {
                    totalWeight += weight;
                }
            });
        });
        
        result.push({
            begin: currentTime,
            end: currentTime.add(1, 'hour'),
            weight: totalWeight
        });
    }
    // 时间向后推进1小时
    currentTime = currentTime.add(1, 'hour');
}

// 按照权重排序
result.sort((a, b) => {
    return b.weight - a.weight;
});

// 输出结果
// 需要按照表格形式输出
// 格式：
// | 备选时间段（UTC格式） | 备选时间段（候选人1所在时区） | 备选时间段（候选人2所在时区） | ... | 备选时间段（候选人n所在时区） | 总权重
// 即需要包含每个候选人对应时区的时间段
// 由于候选人的数量是不确定的，所以需要动态生成表格
// 需要输出表头
const times = config.people.map(person => {
    const name = `${person.name} in ${person.timezone}`;
    const padding = ' '.repeat((35 - name.length) / 2);
    if (name.length % 2 === 0) {
        return padding + name + ' ' + padding;
    }
    return padding + name + padding;
});
console.log('|:-----------------------------------:|:-----------------------------------:|:-----------------------------------:|:-:|');
console.log(`|   Available time in Europe/London   | ${times.join(' | ')} | W |`);
console.log('|:-----------------------------------:|:-----------------------------------:|:-----------------------------------:|:-:|');
result.forEach(({ begin, end, weight }) => {
    const time = `${begin.utc().format(format)} - ${end.utc().format(format)}`;
    const times = config.people.map(person => {
        const beginTime = dayjs.tz(begin.utc(), person.timezone);
        const endTime = dayjs.tz(end.utc(), person.timezone);
        return `${beginTime.format(format)} - ${endTime.format(format)}`;
    });
    console.log(`| ${time} | ${times.join(' | ')} | ${weight} |`);
});
console.log('|:-----------------------------------:|:-----------------------------------:|:-----------------------------------:|:-:|');
