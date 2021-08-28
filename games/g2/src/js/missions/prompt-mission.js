class PromptMission extends MissionStep {

    constructor(missionStep) {
        super();
        this.missionStep = missionStep;
    }

    attach() {
        super.attach();

        let timeleft = 15;
        this.listen(EVENT_CYCLE, e => {
            if ((timeleft -= e) < 0) {
                this.proceed();
            }
        });

        G.showPrompt(() => nomangle('Incoming communication from ') + this.missionStep.civilization.center.nameWithRelationship() + ' - ' + formatTime(timeleft), [{
            'label': nomangle('Respond'),
            'action': () => {
                timeleft = 15;
                G.showPrompt(() => this.missionStep.prompt + ' - ' + formatTime(timeleft), [{
                    'label': nomangle('Accept'),
                    'action': () => this.proceed(this.missionStep)
                }, {
                    'label': nomangle('Refuse'),
                    'action': () => this.proceed()
                }]);
            }
        }, {
            'label': nomangle('Ignore'),
            'action': () => this.proceed()
        }]);
    }

    proceed(missionStep) {
        super.proceed(missionStep);

        if (!missionStep) {
            this.missionStep.civilization.updateRelationship(RELATIONSHIP_UPDATE_MISSION_IGNORED);
            G.showPrompt(nomangle('Communication ignored. ') + this.missionStep.civilization.center.name + nomangle(' will remember that'), [{
                'label': dismiss,
                'action': () => G.showPrompt()
            }]);
            setTimeout(() => G.showPrompt(), 5000);
        }
    }

}
