FROM iojs:1.8

RUN mkdir -p /usr/src/app

WORKDIR /usr/src/app

VOLUME /root/.npm

COPY .npmrc /root/.npmrc

ENV NPM_CONFIG_LOGLEVEL=warn

RUN npm install -g nodemon && npm install -g babel && npm install -g node-gyp-install

ADD package.json /usr/src/app/package.json

RUN npm install

ADD . /usr/src/app

EXPOSE 8000

ENTRYPOINT ["nodemon", "--watch", "/config", "--exec"]

CMD [ "./scripts/start.sh"]
