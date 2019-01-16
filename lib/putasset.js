'use strict';

const {promisify} = require('util');
const path = require('path');
const fs = require('fs');
const stat = promisify(fs.stat);

const github = require('@octokit/rest')();
const mime = require('mime-types');
const tryToCatch = require('try-to-catch');

module.exports = async (token, {owner, repo, tag, filename}) => {
    check(token, {owner, repo, tag, filename});
    
    const type = 'oauth';
    github.authenticate({
        type,
        token,
    });

    const file_basename= path.basename(filename);

    const asset_id = await github.repos.listReleases(
        { owner, repo, "per_page": 100, "page": 1 }
    ).then(({ data }) =>{

        const asset= data
            .find(({ tag_name }) => tag_name === tag)
            .assets
            .find(({ name })=> name === file_basename)
            ;

        return !!asset?asset.id:undefined;

    });

    if( asset_id !== undefined ){

        await github.repos.deleteReleaseAsset(
            {owner, repo, asset_id}
        );

    }
    
    const [url, {size}] = await Promise.all([
        getReleaseUrl(owner, repo, tag),
        stat(filename),
    ]);
    
    await uploadAsset({
        owner,
        repo,
        filename,
        size,
        url,
    });

    return `https://github.com/${owner}/${repo}/releases/download/${tag}/${file_basename}`;

};

async function uploadAsset({owner, repo, filename, size, url}) {
    const name = path.basename(filename);
    
    return github.repos.uploadReleaseAsset({
        url,
        file: fs.createReadStream(filename),
        headers: {
            'content-type': mime.lookup(filename),
            'content-length': size,
        },
        name,
        owner,
        repo,
    });
}

async function getReleaseUrl(owner, repo, tag) {
    const [e, release] = await tryToCatch(github.repos.getReleaseByTag, {
        owner,
        repo,
        tag,
    });
    
    if (e)
        throw Error(`Release: ${e.message}`);
     
    return release.data.upload_url;
}

function check(token, {owner, repo, tag, filename}) {
    const items = [
        {token, name: 'token'},
        {owner, name: 'owner'},
        {repo, name: 'repo'},
        {tag, name: 'tag'},
        {filename, name: 'filename'}
    ];
    
    items.filter((item) => {
        return typeof item[item.name] !== 'string';
    }).forEach(({name}) => {
        throw Error(`${name} must to be a string!`);
    });
}

