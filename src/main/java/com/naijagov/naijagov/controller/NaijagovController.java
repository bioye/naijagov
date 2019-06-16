package com.naijagov.naijagov.controller;

import com.naijagov.naijagov.model.Form;
import com.naijagov.naijagov.service.PollingUnitService;

import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.servlet.ModelAndView;

@Controller
public class NaijagovController{

    @GetMapping("/pollingunits")
    public ModelAndView pollingUnits(@PageableDefault(size=20, sort="code", 
                                direction=Sort.Direction.ASC) Pageable pageable, 
                                @ModelAttribute Form form, ModelAndView mv, 
                                @RequestParam("sortBy") Optional<String> sortBy, 
                                @RequestParam("sortDirection") Optional<Sort.Direction> sortDirection){
        Pageable sortedPage = pageable;
        if(form.getPollingUnitsPage()==null){
            sortedPage=pageable;
        }
        else if(sortBy.isPresent() &&sortDirection.isPresent()) 
            sortedPage = PageRequest.of(form.getPollingUnitsPage().getNumber(), 
                                      form.getPollingUnitsPage().getSize(),
                                      sortDirection.get(), sortBy.get());
        else if(form.getPollingUnitsPage()!=null) 
            sortedPage = PageRequest.of(pageable.getPageNumber(), pageable.getPageSize(), 
                                        form.getPollingUnitsPage().getSort());
        form.setPollingUnitsPage(pollingUnitService.listAllPollingUnits(sortedPage));

        mv.setViewName("pollingunits");
        return mv;
    }
    
    @Autowired
    public NaijagovController(PollingUnitService pollingUnitService){
        this.pollingUnitService=pollingUnitService;
    }
    private PollingUnitService pollingUnitService;
}