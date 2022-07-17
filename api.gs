'use strict';

const expirationInSeconds = 15 * 60; // 15 minutes
const otpLength = 8;

function sendVerificationEmail(emailAddress, websiteTitle, url, otp) {
    url += url.indexOf('?') == -1 ? '?' : '&';
    url += `email=${encodeURIComponent(emailAddress)}&otp=${encodeURIComponent(otp)}`;
    let subject = 'Validate email';
    if (websiteTitle != null) {
        subject += ` for ${websiteTitle}`;
    }
    const htmlBody = `
<!DOCTYPE html>
<html>
  <head>
    <base target="_top">
  </head>
  <body>
    <h2>${subject}:</h2>
    <p>Click <a href="${url}">here</a> or go to ${url}</p>
    <p>This link expires in ${Math.floor(expirationInSeconds / 60)} minutes.</p>
  </body>
</html>`;
    if (MailApp.getRemainingDailyQuota() < 1) {
        throw new Error('Daily quota exceeded');
    }
    MailApp.sendEmail({
        to: emailAddress,
        subject: subject,
        htmlBody: htmlBody
    });
}

function checkApiKey(apiKey) {
    const api_key_property_key = 'api_key';
    const expectedApiKey = ScriptProperties.getProperty(api_key_property_key);
    if (expectedApiKey == null) {
        throw new Error(`No script property with key ${api_key_property_key}`);
    }
    return expectedApiKey == apiKey;
}

function createCacheKey(emailAddress, operation) {
    let key = emailAddress;
    if (operation != null) {
        key += `__${operation}`;
    }
    return key;
}

function createOtp(emailAddress, operation = null) {
    let alphabet = '';
    // Numbers
    alphabet += [...Array(10).keys()].join('');
    // Uppercase letters
    alphabet += [...Array('Z'.charCodeAt(0) - 'A'.charCodeAt(0) + 1).keys()].map(i => String.fromCharCode('A'.charCodeAt(0) + i)).join('');
    const otp = [...Array(otpLength).keys()].map(_ => alphabet.charAt(Math.floor(Math.random() * alphabet.length))).join('');
    const key = createCacheKey(emailAddress, operation);
    CacheService.getScriptCache().put(key, otp, expirationInSeconds);
    return otp;
}

function verifyAndDestroyOtp(emailAddress, otp, operation = null) {
    if (otp == null) {
        return false;
    }
    const cache = CacheService.getScriptCache();
    const key = createCacheKey(emailAddress, operation);
    const isCorrect = CacheService.getScriptCache().get(key) == otp;
    cache.remove(key);
    return isCorrect;
}

/**
 * API following JSend specification (https://github.com/omniti-labs/jsend)
 */
function createResponse(status, data) {
    const jsendResponse = {
        'status': status,
        'data': data,
    };
    const jsendOutput = JSON.stringify(jsendResponse);
    console.log(jsendOutput);
    return ContentService.createTextOutput(jsendOutput).setMimeType(ContentService.MimeType.JSON);
}

function createError(message) {
    const jsendResponse = {
        'status': 'error',
        'message': message,
    };
    const jsendOutput = JSON.stringify(jsendResponse);
    console.log(jsendOutput);
    return ContentService.createTextOutput(jsendOutput).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
    try {
        checkApiKey(null);
        return createResponse('success', { description: 'HTTP email verification API' });
    }
    catch (err) {
        return createError(err.message);
    }
}

function doPost(request) {
    try {
        const json = request.postData.getDataAsString();
        const data = JSON.parse(json);
        if (!checkApiKey(request.parameter['api_key'])) {
            return createResponse('fail', { api_key: 'valid api key required' });
        }
        if (data.emailAddress == null) {
            return createResponse('fail', { emailAddress: 'valid email address required' });
        }
        const maxLengthOperation = 20;
        if (data.operation != null && data.operation.length > maxLengthOperation) {
            return createResponse('fail', { operation: `key of operation should be at most ${maxLengthOperation}` });
        }
        if (data.step == 'request') {
            if (data.url == null || (!data.url.startsWith('http://') && !data.url.startsWith('https://'))) {
                return createResponse('fail', { url: 'valid URL required' });
            }
            const otp = createOtp(data.emailAddress, data.operation);
            sendVerificationEmail(data.emailAddress, data.websiteTitle, data.url, otp);
            return createResponse('success', null);
        }
        else if (data.step == 'verify') {
            if (data.emailAddress == null) {
                return createResponse('fail', { otp: 'valid OTP required' });
            }
            const isCorrect = verifyAndDestroyOtp(data.emailAddress, data.otp, data.operation);
            return createResponse(isCorrect ? 'success' : 'fail', isCorrect ? null : { otp: 'invalid otp' });
        }
        else {
            return createResponse('fail', { step: 'step must be either request or verify' });
        }
    }
    catch (err) {
        return createError(err.message);
    }
}

