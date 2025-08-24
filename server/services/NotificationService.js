const nodemailer = require('nodemailer');
const axios = require('axios');
const Bottleneck = require('bottleneck');
const EventEmitter = require('events');

class NotificationService extends EventEmitter {
    constructor(emailConfig, smsConfig) {
        super();
        this.emailTransporter = nodemailer.createTransport(emailConfig);
        this.smsConfig = smsConfig;
        this.emailLimiter = new Bottleneck({
            maxConcurrent: 1,
            minTime: 1000, // 1 second between sends
        });
        this.smsLimiter = new Bottleneck({
            maxConcurrent: 1,
            minTime: 1000,
        });
        this.emailQueue = [];
        this.smsQueue = [];
        this.retries = 3;
        this.backoffFactor = 2;
    }

    async sendEmail(to, subject, text) {
        this.emailQueue.push({ to, subject, text, attempts: 0 });
        this.processEmailQueue();
    }

    async processEmailQueue() {
        if(this.emailQueue.length === 0) return;

        const email = this.emailQueue[0];
        try {
            await this.emailLimiter.schedule(() =>
                this.emailTransporter.sendMail({
                    from: process.env.EMAIL_FROM,
                    to: email.to,
                    subject: email.subject,
                    text: email.text
                })
            );
            console.log('Email sent to:', email.to);
            this.emailQueue.shift();
            this.emit('emailSent', email);
            this.processEmailQueue();
        } catch (error) {
            email.attempts++;
            console.error(`Email send attempt ${email.attempts} failed for ${email.to}:`, error);
            if(email.attempts < this.retries){
                const delay = 1000 * (this.backoffFactor ** (email.attempts - 1));
                setTimeout(() => this.processEmailQueue(), delay);
            } else {
                this.emit('emailFailed', email);
                this.emailQueue.shift();
                this.processEmailQueue();
            }
        }
    }

    async sendSms(to, message) {
        this.smsQueue.push({ to, message, attempts: 0 });
        this.processSmsQueue();
    }

    async processSmsQueue() {
        if(this.smsQueue.length === 0) return;

        const sms = this.smsQueue[0];
        try {
            await this.smsLimiter.schedule(() =>
                axios.post(this.smsConfig.url, {
                    to: sms.to,
                    message: sms.message,
                }, {
                    headers: {
                        'apiKey': this.smsConfig.apiKey
                    },
                })
            );
            console.log('SMS sent to:', sms.to);
            this.smsQueue.shift();
            this.emit('smsSent', sms);
            this.processSmsQueue();
        } catch (error) {
            sms.attempts++;
            console.error(`SMS send attempt ${sms.attempts} failed for ${sms.to}:`, error);
            if(sms.attempts < this.retries){
                const delay = 1000 * (this.backoffFactor ** (sms.attempts - 1));
                setTimeout(() => this.processSmsQueue(), delay);
            } else {
                this.emit('smsFailed', sms);
                this.smsQueue.shift();
                this.processSmsQueue();
            }
        }
    }

    formatTemplate(template, variables) {
        return template.replace(/\{\{(.*?)\}\}/g, (_, key) => variables[key.trim()] || '');
    }
}

module.exports = NotificationService;
